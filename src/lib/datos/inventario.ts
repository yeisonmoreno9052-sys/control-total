// Escrituras de inventario: crear y editar productos, ajustar stock.
//
// Todo cambio de stock pasa por registrarMovimiento(), que bloquea la fila del
// producto mientras calcula (así dos cambios al mismo tiempo no se pisan) y deja
// un MovimientoInventario. El stock siempre se puede explicar por sus movimientos.
import type { MotivoAjuste, TipoMovimiento } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { Decimal, leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "@/lib/inventario/cantidades";
import type { ProductoEntrada } from "@/lib/inventario/esquemas";
import { exigirGestion } from "@/lib/permisos";
import { AccesoDenegado, datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";

export type Resultado<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string; campos?: Record<string, string> };

export type Tx = Prisma.TransactionClient;

export function exigirNegocioPermitido(ctx: Contexto, negocioId: string) {
  if (!ctx.negociosPermitidos.includes(negocioId)) throw new AccesoDenegado("no tienes acceso a ese negocio");
}

/** Traduce errores de la base a mensajes para la persona. */
export function mensajeDeError(error: unknown): { error: string; campos?: Record<string, string> } | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const destino = JSON.stringify(error.meta ?? {});
    if (destino.includes("codigoBarras")) {
      return { error: "Ya hay otro producto con ese código de barras.", campos: { codigoBarras: "Ya está en uso." } };
    }
    if (destino.includes("codigo")) {
      return { error: "Ya hay otro producto con ese código.", campos: { codigo: "Ya está en uso." } };
    }
    if (destino.includes("nombre")) {
      return { error: "Ya existe una categoría con ese nombre.", campos: { nombre: "Ya existe." } };
    }
  }
  return null;
}

export async function registrarAuditoria(
  tx: Tx,
  ctx: Contexto,
  datos: { negocioId: string | null; accion: string; entidad: string; entidadId?: string; detalle: object },
) {
  await tx.auditoria.create({
    data: {
      empresaId: ctx.empresaId,
      negocioId: datos.negocioId,
      usuarioId: ctx.usuarioId,
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId ?? null,
      detalle: datos.detalle,
    },
  });
}

/**
 * Cambia el stock de un producto y deja el movimiento. Debe llamarse dentro de
 * una transacción y con un producto que ya se verificó que el usuario puede ver.
 */
export async function registrarMovimiento(
  tx: Tx,
  ctx: Contexto,
  mov: {
    productoId: string;
    tipo: TipoMovimiento;
    /** Positiva si entra, negativa si sale. */
    cantidad: Decimal;
    motivo?: MotivoAjuste | null;
    nota?: string | null;
    permitirNegativo?: boolean;
  },
) {
  // FOR UPDATE bloquea la fila hasta que termine la transacción.
  const filas = await tx.$queryRaw<{ stock: Prisma.Decimal; negocioId: string; empresaId: string }[]>`
    SELECT "stock", "negocioId", "empresaId" FROM "Producto" WHERE "id" = ${mov.productoId} FOR UPDATE`;
  const fila = filas[0];
  if (!fila || fila.empresaId !== ctx.empresaId || !ctx.negociosPermitidos.includes(fila.negocioId)) {
    throw new AccesoDenegado("producto no encontrado");
  }

  const antes = new Decimal(fila.stock.toString());
  const despues = antes.plus(mov.cantidad);
  if (despues.isNegative() && !mov.permitirNegativo) {
    throw new StockInsuficiente();
  }

  await tx.producto.update({ where: { id: mov.productoId }, data: { stock: despues.toString() } });
  await tx.movimientoInventario.create({
    data: {
      empresaId: ctx.empresaId,
      negocioId: fila.negocioId,
      productoId: mov.productoId,
      usuarioId: ctx.usuarioId,
      tipo: mov.tipo,
      motivo: mov.motivo ?? null,
      nota: mov.nota ?? null,
      cantidad: mov.cantidad.toString(),
      stockAntes: antes.toString(),
      stockDespues: despues.toString(),
    },
  });
  return { antes, despues, negocioId: fila.negocioId };
}

export class StockInsuficiente extends Error {
  constructor() {
    super("No hay suficiente stock de este producto.");
    this.name = "StockInsuficiente";
  }
}

async function validarCategoria(ctx: Contexto, negocioId: string, categoriaId: string | null | undefined) {
  if (!categoriaId) return true;
  const categoria = await datosDe(ctx).categoria.findFirst({
    where: { id: categoriaId, negocioId, activo: true },
    select: { id: true },
  });
  return !!categoria;
}

function datosProducto(p: ProductoEntrada) {
  return {
    codigo: p.codigo,
    codigoBarras: p.codigoBarras ?? null,
    nombre: p.nombre,
    descripcion: p.descripcion ?? null,
    categoriaId: p.categoriaId ?? null,
    costo: p.costo,
    precioVenta: p.precioVenta,
    stockMinimo: p.stockMinimo,
    unidad: p.unidad,
    fraccionado: p.fraccionado,
    porcentajeIva: p.porcentajeIva,
    condicion: p.condicion,
  };
}

export async function crearProducto(
  ctx: Contexto,
  negocioId: string,
  entrada: ProductoEntrada,
  stockInicialTexto: string,
): Promise<Resultado> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);

  const stockInicial = stockInicialTexto.trim() ? leerCantidad(stockInicialTexto) : new Decimal(0);
  const errorStock = validarCantidad(stockInicial, { fraccionado: entrada.fraccionado });
  if (errorStock) return { ok: false, error: "Revisa el stock inicial.", campos: { stockInicial: MENSAJES_CANTIDAD[errorStock] } };
  if (!(await validarCategoria(ctx, negocioId, entrada.categoriaId))) {
    return { ok: false, error: "Esa categoría no existe en este negocio.", campos: { categoriaId: "Elige otra." } };
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({
        data: { ...datosProducto(entrada), empresaId: ctx.empresaId, negocioId },
        select: { id: true },
      });
      if (stockInicial && !stockInicial.isZero()) {
        await registrarMovimiento(tx, ctx, { productoId: producto.id, tipo: "CREACION", cantidad: stockInicial });
      }
      return producto.id;
    });
    return { ok: true, id };
  } catch (error) {
    const mensaje = mensajeDeError(error);
    if (mensaje) return { ok: false, ...mensaje };
    throw error;
  }
}

/** Edita los datos de un producto. El stock NO se cambia aquí: se usa ajustarStock(). */
export async function actualizarProducto(ctx: Contexto, id: string, entrada: ProductoEntrada): Promise<Resultado> {
  exigirGestion(ctx);
  const actual = await datosDe(ctx).producto.findFirst({
    where: { id },
    select: { id: true, negocioId: true, costo: true, precioVenta: true, stock: true },
  });
  if (!actual) return { ok: false, error: "No encontramos ese producto." };

  if (!entrada.fraccionado && !new Decimal(actual.stock.toString()).isInteger()) {
    return {
      ok: false,
      error: "Este producto tiene stock con decimales; ajústalo a un número entero antes de quitar la venta fraccionada.",
      campos: { fraccionado: "Tiene stock con decimales." },
    };
  }
  if (!(await validarCategoria(ctx, actual.negocioId, entrada.categoriaId))) {
    return { ok: false, error: "Esa categoría no existe en este negocio.", campos: { categoriaId: "Elige otra." } };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.producto.update({ where: { id: actual.id }, data: datosProducto(entrada) });
      if (actual.costo !== entrada.costo || actual.precioVenta !== entrada.precioVenta) {
        await registrarAuditoria(tx, ctx, {
          negocioId: actual.negocioId,
          accion: "CAMBIO_PRECIO",
          entidad: "Producto",
          entidadId: actual.id,
          detalle: {
            codigo: entrada.codigo,
            costo: { antes: actual.costo, despues: entrada.costo },
            precioVenta: { antes: actual.precioVenta, despues: entrada.precioVenta },
          },
        });
      }
    });
    return { ok: true, id: actual.id };
  } catch (error) {
    const mensaje = mensajeDeError(error);
    if (mensaje) return { ok: false, ...mensaje };
    throw error;
  }
}

/** Desactiva (borrado lógico) o reactiva un producto. */
export async function cambiarActivoProducto(ctx: Contexto, id: string, activo: boolean): Promise<Resultado> {
  exigirGestion(ctx);
  const { count } = await datosDe(ctx).producto.updateMany({ where: { id }, data: { activo } });
  return count ? { ok: true, id } : { ok: false, error: "No encontramos ese producto." };
}

export type EntradaAjuste = {
  /** "nuevo": la cantidad es el stock contado. "diferencia": se suma o resta. */
  modo: "nuevo" | "diferencia";
  cantidad: string;
  motivo: MotivoAjuste;
  nota?: string | null;
};

export async function ajustarStock(ctx: Contexto, productoId: string, ajuste: EntradaAjuste): Promise<Resultado> {
  exigirGestion(ctx);
  const producto = await datosDe(ctx).producto.findFirst({
    where: { id: productoId },
    select: { id: true, codigo: true, negocioId: true, fraccionado: true },
  });
  if (!producto) return { ok: false, error: "No encontramos ese producto." };

  const nota = ajuste.nota?.trim() || null;
  if (ajuste.motivo === "OTRO" && !nota) {
    return { ok: false, error: "Cuéntanos el motivo del ajuste.", campos: { nota: "Escribe el motivo." } };
  }

  const cantidad = leerCantidad(ajuste.cantidad);
  const error = validarCantidad(cantidad, {
    fraccionado: producto.fraccionado,
    permitirNegativa: ajuste.modo === "diferencia",
  });
  if (error || !cantidad) return { ok: false, error: "Revisa la cantidad.", campos: { cantidad: MENSAJES_CANTIDAD[error ?? "invalida"] } };

  try {
    await prisma.$transaction(async (tx) => {
      let delta = cantidad;
      if (ajuste.modo === "nuevo") {
        const [fila] = await tx.$queryRaw<{ stock: Prisma.Decimal }[]>`
          SELECT "stock" FROM "Producto" WHERE "id" = ${producto.id} FOR UPDATE`;
        delta = cantidad.minus(fila.stock.toString());
      }
      if (delta.isZero()) throw new SinCambios();

      const { antes, despues } = await registrarMovimiento(tx, ctx, {
        productoId: producto.id,
        tipo: "AJUSTE",
        cantidad: delta,
        motivo: ajuste.motivo,
        nota,
      });
      await registrarAuditoria(tx, ctx, {
        negocioId: producto.negocioId,
        accion: "AJUSTE_STOCK",
        entidad: "Producto",
        entidadId: producto.id,
        detalle: {
          codigo: producto.codigo,
          motivo: ajuste.motivo,
          nota,
          antes: antes.toString(),
          despues: despues.toString(),
        },
      });
    });
    return { ok: true, id: producto.id };
  } catch (e) {
    if (e instanceof SinCambios) return { ok: false, error: "El stock ya tiene ese valor; no hay nada que ajustar." };
    if (e instanceof StockInsuficiente) {
      return { ok: false, error: "El stock no puede quedar negativo.", campos: { cantidad: "Es más de lo que hay." } };
    }
    throw e;
  }
}

class SinCambios extends Error {}
