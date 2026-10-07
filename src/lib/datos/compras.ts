// Proveedores, facturas de compra, abonos y adjuntos.
//
// Al registrar una factura, en una sola transacción:
//   1. se bloquean los productos (en orden de id, como en las ventas),
//   2. se recalcula el costo promedio ponderado y, si se pidió, el precio de venta,
//   3. sube el stock con movimientos de tipo COMPRA,
//   4. si es de contado, queda pagada (y si fue en efectivo desde la caja, sale de ella).
// Solo administrador y socio usan este módulo; el cajero no entra.
import { z } from "zod";
import type { MedioPago } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { costoPromedio, estadoDePago, totalLinea } from "@/lib/compras/costos";
import { diaEnBogota, fechaDeHoy } from "@/lib/formato";
import { Decimal, MENSAJES_CANTIDAD, formatearCantidad, leerCantidad, validarCantidad } from "@/lib/inventario/cantidades";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { cajaAbiertaDeHoy } from "./caja";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import {
  exigirNegocioPermitido,
  registrarAuditoria,
  registrarMovimiento,
  StockInsuficiente,
  type Resultado,
  type Tx,
} from "./inventario";

class ErrorCompra extends Error {}

function comoResultado(error: unknown): { ok: false; error: string } {
  if (error instanceof ErrorCompra) return { ok: false, error: error.message };
  throw error;
}

function exigir(ctx: Contexto, negocioId?: string) {
  exigirGestion(ctx);
  if (negocioId) exigirNegocioPermitido(ctx, negocioId);
}

const aFecha = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(aFecha(v).getTime());

// ─── Proveedores ────────────────────────────────────────────────────────────

const opcional = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres.`).transform((v) => v || null).nullable().optional();

export const esquemaProveedor = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del proveedor.").max(150),
  nit: opcional(30).transform((v) => v?.replace(/\s/g, "") || null),
  contacto: opcional(100),
  telefono: opcional(40),
  correo: z
    .string()
    .trim()
    .max(150)
    .transform((v) => v || null)
    .refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), "Escribe un correo válido.")
    .nullable()
    .optional(),
  notas: opcional(500),
});

export type ProveedorVista = {
  id: string;
  nombre: string;
  nit: string | null;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  activo: boolean;
};

const CAMPOS_PROVEEDOR = {
  id: true, nombre: true, nit: true, contacto: true, telefono: true, correo: true, notas: true, activo: true,
} as const;

/** Proveedores del negocio con lo que se les debe. */
export async function listarProveedores(ctx: Contexto, negocioId: string, opciones: { q?: string; inactivos?: boolean } = {}) {
  exigir(ctx, negocioId);
  const datos = datosDe(ctx);
  const q = opciones.q?.trim();
  const proveedores = await datos.proveedor.findMany({
    where: {
      negocioId,
      ...(opciones.inactivos ? {} : { activo: true }),
      ...(q
        ? { OR: [{ nombre: { contains: q, mode: "insensitive" as const } }, { nit: { startsWith: q.replace(/\s/g, "") } }] }
        : {}),
    },
    select: CAMPOS_PROVEEDOR,
    orderBy: { nombre: "asc" },
    take: 200,
  });
  const deudas = await deudaPorProveedor(ctx, negocioId);
  return proveedores.map((p) => ({ ...p, deuda: deudas.get(p.id) ?? 0 }));
}

async function deudaPorProveedor(ctx: Contexto, negocioId: string) {
  const grupos = await datosDe(ctx).facturaCompra.groupBy({
    by: ["proveedorId"],
    where: { negocioId, estado: "REGISTRADA", estadoPago: { not: "PAGADA" } },
    _sum: { total: true, pagado: true },
  });
  return new Map(grupos.map((g) => [g.proveedorId, (g._sum.total ?? 0) - (g._sum.pagado ?? 0)]));
}

export async function obtenerProveedor(ctx: Contexto, id: string): Promise<(ProveedorVista & { negocioId: string }) | null> {
  exigir(ctx);
  return datosDe(ctx).proveedor.findFirst({ where: { id }, select: { ...CAMPOS_PROVEEDOR, negocioId: true } });
}

/** Crea (id null) o edita un proveedor. El NIT no se repite dentro del negocio. */
export async function guardarProveedor(
  ctx: Contexto,
  negocioId: string,
  id: string | null,
  entrada: unknown,
): Promise<Resultado> {
  exigir(ctx, negocioId);
  const datos = esquemaProveedor.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const tabla = datosDe(ctx).proveedor;
  if (datos.data.nit) {
    const otro = await tabla.findFirst({ where: { negocioId, nit: datos.data.nit, ...(id ? { id: { not: id } } : {}) }, select: { nombre: true } });
    if (otro) return { ok: false, error: `Ese NIT ya es de ${otro.nombre}.`, campos: { nit: "Ya existe." } };
  }
  if (id) {
    const { count } = await tabla.updateMany({ where: { id, negocioId }, data: datos.data });
    return count ? { ok: true, id } : { ok: false, error: "No encontramos ese proveedor." };
  }
  const creado = await tabla.create({ data: { empresaId: ctx.empresaId, negocioId, ...datos.data }, select: { id: true } });
  return { ok: true, id: creado.id };
}

export async function cambiarActivoProveedor(ctx: Contexto, id: string, activo: boolean): Promise<Resultado> {
  exigir(ctx);
  const { count } = await datosDe(ctx).proveedor.updateMany({ where: { id }, data: { activo } });
  return count ? { ok: true, id } : { ok: false, error: "No encontramos ese proveedor." };
}

// ─── Productos para la factura ──────────────────────────────────────────────

export type ProductoCompra = {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  fraccionado: boolean;
  condicion: "NUEVO" | "DE_SEGUNDA";
  costo: number;
  precioVenta: number;
  stock: string;
  /** Margen que aplica (el de la categoría o el del negocio), en %. */
  margen: number;
};

/** Búsqueda para agregar líneas a una factura: por código exacto, código de barras o nombre. */
export async function buscarProductosCompra(ctx: Contexto, negocioId: string, texto: string) {
  exigir(ctx, negocioId);
  const q = texto.trim().slice(0, 100);
  if (!q) return { exacto: null, resultados: [] as ProductoCompra[] };
  const datos = datosDe(ctx);
  const campos = {
    id: true, codigo: true, nombre: true, unidad: true, fraccionado: true, condicion: true, costo: true,
    precioVenta: true, stock: true, categoriaId: true,
  } as const;
  const exacto = await datos.producto.findFirst({
    where: { negocioId, activo: true, OR: [{ codigoBarras: q }, { codigo: { equals: q, mode: "insensitive" } }] },
    select: campos,
  });
  const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const filas = exacto
    ? [exacto]
    : await datos.producto.findMany({
        where: {
          negocioId,
          activo: true,
          OR: [
            { codigo: { startsWith: q, mode: "insensitive" } },
            { AND: palabras.map((p) => ({ nombre: { contains: p, mode: "insensitive" as const } })) },
          ],
        },
        select: campos,
        orderBy: [{ nombre: "asc" }, { id: "asc" }],
        take: 8,
      });
  const conMargen = await agregarMargen(ctx, negocioId, filas);
  return { exacto: exacto ? conMargen[0] : null, resultados: conMargen };
}

/** Datos de compra de productos puntuales (por ejemplo, uno recién creado desde la factura). */
export async function productosParaCompra(ctx: Contexto, negocioId: string, ids: string[]) {
  exigir(ctx, negocioId);
  const filas = await datosDe(ctx).producto.findMany({
    where: { negocioId, id: { in: ids.slice(0, 300) } },
    select: {
      id: true, codigo: true, nombre: true, unidad: true, fraccionado: true, condicion: true, costo: true,
      precioVenta: true, stock: true, categoriaId: true,
    },
  });
  return agregarMargen(ctx, negocioId, filas);
}

async function agregarMargen(
  ctx: Contexto,
  negocioId: string,
  filas: (Omit<ProductoCompra, "margen" | "stock"> & { stock: { toString(): string }; categoriaId: string | null })[],
): Promise<ProductoCompra[]> {
  const datos = datosDe(ctx);
  const ids = [...new Set(filas.map((f) => f.categoriaId).filter((x): x is string => !!x))];
  const [negocio, categorias] = await Promise.all([
    datos.negocio.findFirst({ where: { id: negocioId }, select: { margenSugerido: true } }),
    ids.length ? datos.categoria.findMany({ where: { id: { in: ids } }, select: { id: true, margenSugerido: true } }) : [],
  ]);
  const margenCategoria = new Map(categorias.map((c) => [c.id, c.margenSugerido === null ? null : Number(c.margenSugerido)]));
  const margenNegocio = Number(negocio?.margenSugerido ?? 0);
  return filas.map(({ categoriaId, ...f }) => ({
    ...f,
    stock: f.stock.toString(),
    margen: (categoriaId ? margenCategoria.get(categoriaId) : null) ?? margenNegocio,
  }));
}

// ─── Registrar factura ──────────────────────────────────────────────────────

export type LineaFactura = {
  productoId: string;
  cantidad: string;
  costoUnitario: number;
  /** Nuevo precio de venta. null = no se cambia. */
  precioVenta: number | null;
  /** En productos de segunda: la persona confirmó el costo y el precio. */
  confirmado?: boolean;
};

export type PagoFactura =
  | { tipo: "contado"; medio: MedioPago; desdeCaja: boolean; referencia?: string | null }
  | { tipo: "credito" };

export type EntradaFactura = {
  proveedorId: string;
  numero: string;
  fecha: string;
  vencimiento?: string | null;
  nota?: string | null;
  lineas: LineaFactura[];
  pago: PagoFactura;
};

type ProductoBloqueado = {
  id: string;
  empresaId: string;
  negocioId: string;
  nombre: string;
  costo: number;
  precioVenta: number;
  stock: Prisma.Decimal;
  condicion: string;
  fraccionado: boolean;
  activo: boolean;
};

async function bloquearProductos(tx: Tx, ids: string[]) {
  const filas = await tx.$queryRaw<ProductoBloqueado[]>`
    SELECT "id", "empresaId", "negocioId", "nombre", "costo", "precioVenta", "stock", "condicion", "fraccionado", "activo"
    FROM "Producto" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
  return new Map(filas.map((f) => [f.id, f]));
}

/** Pone el pagado y el estado de pago de la factura según sus abonos vigentes. */
async function recalcularPagado(tx: Tx, facturaId: string) {
  const [factura, suma] = await Promise.all([
    tx.facturaCompra.findUniqueOrThrow({ where: { id: facturaId }, select: { total: true } }),
    tx.abonoFactura.aggregate({ where: { facturaId, anulado: false }, _sum: { valor: true } }),
  ]);
  const pagado = suma._sum.valor ?? 0;
  await tx.facturaCompra.update({
    where: { id: facturaId },
    data: { pagado, estadoPago: estadoDePago(factura.total, pagado) },
  });
}

/** Caja de hoy para un pago en efectivo que sale de ella. */
async function cajaParaPago(tx: Tx, ctx: Contexto, negocioId: string, medio: MedioPago, desdeCaja: boolean) {
  if (medio !== "EFECTIVO" || !desdeCaja) return null;
  const caja = await cajaAbiertaDeHoy(tx, ctx, negocioId);
  if (!caja) {
    throw new ErrorCompra('La caja de hoy no está abierta. Ábrela o desmarca "Sale de la caja".');
  }
  return caja.id;
}

export async function registrarFactura(
  ctx: Contexto,
  negocioId: string,
  entrada: EntradaFactura,
): Promise<Resultado<{ id: string; total: number }>> {
  exigir(ctx, negocioId);
  const numero = entrada.numero.trim().slice(0, 40);
  if (!numero) return { ok: false, error: "Escribe el número de la factura.", campos: { numero: "Es obligatorio." } };
  if (!esDia(entrada.fecha)) return { ok: false, error: "Revisa la fecha de la factura.", campos: { fecha: "Fecha no válida." } };
  if (entrada.fecha > diaEnBogota()) {
    return { ok: false, error: "La fecha de la factura no puede ser futura.", campos: { fecha: "Es una fecha futura." } };
  }
  const vencimiento = entrada.pago.tipo === "credito" ? entrada.vencimiento?.trim() || null : null;
  if (entrada.pago.tipo === "credito") {
    if (!vencimiento || !esDia(vencimiento)) {
      return { ok: false, error: "Escribe la fecha de vencimiento de la factura a crédito.", campos: { vencimiento: "Es obligatoria." } };
    }
    if (vencimiento < entrada.fecha) {
      return { ok: false, error: "El vencimiento no puede ser antes de la fecha de la factura.", campos: { vencimiento: "Revisa la fecha." } };
    }
  }
  if (!entrada.lineas.length) return { ok: false, error: "Agrega al menos un producto a la factura." };
  if (entrada.lineas.length > 300) return { ok: false, error: "La factura tiene demasiadas líneas (máximo 300)." };

  const proveedor = await datosDe(ctx).proveedor.findFirst({
    where: { id: entrada.proveedorId, negocioId },
    select: { id: true, nombre: true, activo: true },
  });
  if (!proveedor) return { ok: false, error: "Elige el proveedor.", campos: { proveedorId: "Es obligatorio." } };

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Bloquea al proveedor: dos personas no registran la misma factura a la vez.
        await tx.$queryRaw`SELECT "id" FROM "Proveedor" WHERE "id" = ${proveedor.id} FOR UPDATE`;
        const repetida = await tx.facturaCompra.findFirst({
          where: { proveedorId: proveedor.id, numero: { equals: numero, mode: "insensitive" }, estado: "REGISTRADA" },
          select: { id: true },
        });
        if (repetida) throw new ErrorCompra(`La factura ${numero} de ${proveedor.nombre} ya está registrada.`);

        const productos = await bloquearProductos(tx, [...new Set(entrada.lineas.map((l) => l.productoId))]);
        // Estado de cada producto mientras se recorren las líneas (puede repetirse en la factura).
        const estado = new Map<string, { stock: Decimal; costo: number; precio: number; entra: Decimal }>();
        const lineas = entrada.lineas.map((l) => {
          const p = productos.get(l.productoId);
          if (!p || p.empresaId !== ctx.empresaId || p.negocioId !== negocioId) {
            throw new ErrorCompra("Uno de los productos no es de este negocio.");
          }
          const cantidad = leerCantidad(l.cantidad);
          const problema = validarCantidad(cantidad, { fraccionado: p.fraccionado });
          if (problema || !cantidad || cantidad.lte(0)) {
            throw new ErrorCompra(`${p.nombre}: ${problema ? MENSAJES_CANTIDAD[problema] : "la cantidad debe ser mayor que cero."}`);
          }
          if (!Number.isInteger(l.costoUnitario) || l.costoUnitario < 0) throw new ErrorCompra(`${p.nombre}: revisa el costo.`);
          if (l.precioVenta !== null && (!Number.isInteger(l.precioVenta) || l.precioVenta <= 0)) {
            throw new ErrorCompra(`${p.nombre}: revisa el precio de venta.`);
          }
          if (p.condicion === "DE_SEGUNDA" && (!l.confirmado || l.precioVenta === null)) {
            throw new ErrorCompra(`${p.nombre} es de segunda: confirma el costo y el precio de venta.`);
          }
          const actual = estado.get(p.id) ?? {
            stock: new Decimal(p.stock.toString()),
            costo: p.costo,
            precio: p.precioVenta,
            entra: new Decimal(0),
          };
          const costoDespues = costoPromedio(actual.stock, actual.costo, cantidad, l.costoUnitario);
          const precioDespues = l.precioVenta ?? actual.precio;
          const linea = {
            productoId: p.id,
            nombre: p.nombre,
            cantidad,
            costoUnitario: l.costoUnitario,
            total: totalLinea(cantidad, l.costoUnitario),
            costoAntes: actual.costo,
            costoDespues,
            precioAntes: actual.precio,
            precioDespues,
          };
          estado.set(p.id, {
            stock: actual.stock.plus(cantidad),
            costo: costoDespues,
            precio: precioDespues,
            entra: actual.entra.plus(cantidad),
          });
          return linea;
        });
        const total = lineas.reduce((a, l) => a + l.total, 0);

        const factura = await tx.facturaCompra.create({
          data: {
            empresaId: ctx.empresaId,
            negocioId,
            proveedorId: proveedor.id,
            usuarioId: ctx.usuarioId,
            numero,
            fecha: aFecha(entrada.fecha),
            vencimiento: vencimiento ? aFecha(vencimiento) : null,
            total,
            nota: entrada.nota?.trim().slice(0, 300) || null,
          },
          select: { id: true },
        });
        await tx.detalleFacturaCompra.createMany({
          data: lineas.map((l) => ({
            empresaId: ctx.empresaId,
            negocioId,
            facturaId: factura.id,
            productoId: l.productoId,
            cantidad: l.cantidad.toString(),
            costoUnitario: l.costoUnitario,
            total: l.total,
            costoAntes: l.costoAntes,
            costoDespues: l.costoDespues,
            precioAntes: l.precioAntes,
            precioDespues: l.precioDespues,
          })),
        });

        for (const [productoId, e] of [...estado].sort(([a], [b]) => (a < b ? -1 : 1))) {
          const p = productos.get(productoId)!;
          await tx.producto.update({ where: { id: productoId }, data: { costo: e.costo, precioVenta: e.precio } });
          await registrarMovimiento(tx, ctx, {
            productoId,
            tipo: "COMPRA",
            cantidad: e.entra,
            nota: `Factura ${numero} · ${proveedor.nombre}`,
          });
          if (e.precio !== p.precioVenta) {
            await registrarAuditoria(tx, ctx, {
              negocioId,
              accion: "CAMBIO_PRECIO",
              entidad: "Producto",
              entidadId: productoId,
              detalle: { antes: p.precioVenta, despues: e.precio, motivo: `Factura de compra ${numero}` },
            });
          }
        }

        if (entrada.pago.tipo === "contado" && total > 0) {
          const cajaId = await cajaParaPago(tx, ctx, negocioId, entrada.pago.medio, entrada.pago.desdeCaja);
          await tx.abonoFactura.create({
            data: {
              empresaId: ctx.empresaId,
              negocioId,
              facturaId: factura.id,
              usuarioId: ctx.usuarioId,
              valor: total,
              medio: entrada.pago.medio,
              referencia: entrada.pago.referencia?.trim().slice(0, 100) || null,
              nota: "Pago de contado",
              cajaId,
            },
          });
        }
        await recalcularPagado(tx, factura.id);
        await registrarAuditoria(tx, ctx, {
          negocioId,
          accion: "REGISTRO_COMPRA",
          entidad: "FacturaCompra",
          entidadId: factura.id,
          detalle: { proveedor: proveedor.nombre, numero, total, lineas: lineas.length },
        });
        return { ok: true as const, id: factura.id, total };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    return comoResultado(error);
  }
}

// ─── Abonos ─────────────────────────────────────────────────────────────────

async function bloquearFactura(tx: Tx, ctx: Contexto, facturaId: string) {
  const filas = await tx.$queryRaw<
    { id: string; empresaId: string; negocioId: string; numero: string; total: number; pagado: number; estado: string }[]
  >`SELECT "id", "empresaId", "negocioId", "numero", "total", "pagado", "estado"
    FROM "FacturaCompra" WHERE "id" = ${facturaId} FOR UPDATE`;
  const f = filas[0];
  if (!f || f.empresaId !== ctx.empresaId || !ctx.negociosPermitidos.includes(f.negocioId)) {
    throw new ErrorCompra("No encontramos esa factura.");
  }
  return f;
}

export async function registrarAbono(
  ctx: Contexto,
  facturaId: string,
  entrada: { valor: number; medio: MedioPago; desdeCaja: boolean; referencia?: string | null; nota?: string | null },
): Promise<Resultado> {
  exigir(ctx);
  if (!Number.isInteger(entrada.valor) || entrada.valor <= 0) {
    return { ok: false, error: "Escribe el valor del abono.", campos: { valor: "Debe ser mayor que cero." } };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const f = await bloquearFactura(tx, ctx, facturaId);
      if (f.estado !== "REGISTRADA") throw new ErrorCompra("Esta factura está anulada.");
      const saldo = f.total - f.pagado;
      if (saldo <= 0) throw new ErrorCompra("Esta factura ya está pagada.");
      if (entrada.valor > saldo) throw new ErrorCompra(`El abono es mayor que el saldo. Solo se deben ${saldoTexto(saldo)}.`);
      const cajaId = await cajaParaPago(tx, ctx, f.negocioId, entrada.medio, entrada.desdeCaja);
      const abono = await tx.abonoFactura.create({
        data: {
          empresaId: ctx.empresaId,
          negocioId: f.negocioId,
          facturaId,
          usuarioId: ctx.usuarioId,
          valor: entrada.valor,
          medio: entrada.medio,
          referencia: entrada.referencia?.trim().slice(0, 100) || null,
          nota: entrada.nota?.trim().slice(0, 300) || null,
          cajaId,
        },
        select: { id: true },
      });
      await recalcularPagado(tx, facturaId);
      return { ok: true as const, id: abono.id };
    });
  } catch (error) {
    return comoResultado(error);
  }
}

const saldoTexto = (n: number) => `$ ${new Intl.NumberFormat("es-CO").format(n)}`;

/** Anula un abono (por ejemplo, uno mal escrito). Si salió de la caja, el dinero vuelve a contar en ella. */
export async function anularAbono(ctx: Contexto, abonoId: string): Promise<Resultado> {
  exigir(ctx);
  const abono = await datosDe(ctx).abonoFactura.findFirst({
    where: { id: abonoId },
    select: { id: true, facturaId: true, anulado: true, valor: true, cajaId: true },
  });
  if (!abono) return { ok: false, error: "No encontramos ese pago." };
  if (abono.anulado) return { ok: false, error: "Ese pago ya está anulado." };
  try {
    return await prisma.$transaction(async (tx) => {
      const f = await bloquearFactura(tx, ctx, abono.facturaId);
      if (abono.cajaId) {
        const caja = await tx.caja.findUnique({ where: { id: abono.cajaId }, select: { estado: true } });
        if (caja?.estado === "CERRADA") {
          throw new ErrorCompra("Ese pago salió de una caja que ya se cerró. Vuelve a abrir esa caja para anularlo.");
        }
      }
      await tx.abonoFactura.update({
        where: { id: abono.id },
        data: { anulado: true, anuladoEn: new Date(), anuladoPorId: ctx.usuarioId },
      });
      await recalcularPagado(tx, abono.facturaId);
      await registrarAuditoria(tx, ctx, {
        negocioId: f.negocioId,
        accion: "ANULACION_ABONO",
        entidad: "FacturaCompra",
        entidadId: f.id,
        detalle: { factura: f.numero, valor: abono.valor },
      });
      return { ok: true as const, id: abono.id };
    });
  } catch (error) {
    return comoResultado(error);
  }
}

// ─── Anular factura ─────────────────────────────────────────────────────────

/**
 * Anula una factura: el stock que entró vuelve a salir. El costo promedio no se
 * recalcula hacia atrás (cambiaría la utilidad de ventas ya hechas).
 */
export async function anularFactura(ctx: Contexto, facturaId: string, motivo: string): Promise<Resultado> {
  exigir(ctx);
  const motivoLimpio = motivo.trim();
  if (motivoLimpio.length < 3) return { ok: false, error: "Escribe el motivo de la anulación.", campos: { motivo: "Es obligatorio." } };
  try {
    return await prisma.$transaction(async (tx) => {
      const f = await bloquearFactura(tx, ctx, facturaId);
      if (f.estado !== "REGISTRADA") throw new ErrorCompra("Esta factura ya está anulada.");
      const abonos = await tx.abonoFactura.count({ where: { facturaId, anulado: false } });
      if (abonos) throw new ErrorCompra("Esta factura tiene pagos. Anula primero los pagos y después la factura.");

      const detalles = await tx.detalleFacturaCompra.findMany({ where: { facturaId }, select: { productoId: true, cantidad: true } });
      const porProducto = new Map<string, Decimal>();
      for (const d of detalles) porProducto.set(d.productoId, (porProducto.get(d.productoId) ?? new Decimal(0)).plus(d.cantidad.toString()));
      const nombres = new Map(
        (await tx.producto.findMany({ where: { id: { in: [...porProducto.keys()] } }, select: { id: true, nombre: true, stock: true } })).map(
          (p) => [p.id, p],
        ),
      );
      for (const [productoId, cantidad] of [...porProducto].sort(([a], [b]) => (a < b ? -1 : 1))) {
        try {
          await registrarMovimiento(tx, ctx, {
            productoId,
            tipo: "ANULACION",
            cantidad: cantidad.negated(),
            nota: `Anulación factura de compra ${f.numero}`,
          });
        } catch (error) {
          if (!(error instanceof StockInsuficiente)) throw error;
          const p = nombres.get(productoId);
          throw new ErrorCompra(
            `No se puede anular: de "${p?.nombre}" ya se vendió parte y solo quedan ${formatearCantidad(p?.stock.toString() ?? "0")}. Haz un ajuste de stock en su lugar.`,
          );
        }
      }
      await tx.facturaCompra.update({
        where: { id: facturaId },
        data: { estado: "ANULADA", anuladaEn: new Date(), anuladaPorId: ctx.usuarioId, motivoAnulacion: motivoLimpio.slice(0, 300) },
      });
      await registrarAuditoria(tx, ctx, {
        negocioId: f.negocioId,
        accion: "ANULACION_COMPRA",
        entidad: "FacturaCompra",
        entidadId: f.id,
        detalle: { numero: f.numero, total: f.total, motivo: motivoLimpio },
      });
      return { ok: true as const, id: f.id };
    });
  } catch (error) {
    return comoResultado(error);
  }
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export const FACTURAS_POR_PAGINA = 50;

export async function listarFacturas(
  ctx: Contexto,
  negocioId: string,
  filtro: { proveedorId?: string; estadoPago?: "PENDIENTE" | "ABONO_PARCIAL" | "PAGADA"; q?: string; pagina?: number } = {},
) {
  exigir(ctx, negocioId);
  const datos = datosDe(ctx);
  const where: Prisma.FacturaCompraWhereInput = {
    negocioId,
    ...(filtro.proveedorId ? { proveedorId: filtro.proveedorId } : {}),
    ...(filtro.estadoPago ? { estadoPago: filtro.estadoPago, estado: "REGISTRADA" } : {}),
    ...(filtro.q?.trim() ? { numero: { contains: filtro.q.trim(), mode: "insensitive" } } : {}),
  };
  const pagina = Math.max(1, filtro.pagina ?? 1);
  const [facturas, total] = await Promise.all([
    datos.facturaCompra.findMany({
      where,
      select: {
        id: true, numero: true, fecha: true, vencimiento: true, total: true, pagado: true, estadoPago: true, estado: true,
        proveedorId: true,
      },
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
      skip: (pagina - 1) * FACTURAS_POR_PAGINA,
      take: FACTURAS_POR_PAGINA,
    }),
    datos.facturaCompra.count({ where }),
  ]);
  const proveedores = await datos.proveedor.findMany({
    where: { id: { in: [...new Set(facturas.map((f) => f.proveedorId))] } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(proveedores.map((p) => [p.id, p.nombre]));
  return {
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / FACTURAS_POR_PAGINA)),
    facturas: facturas.map((f) => ({ ...f, proveedor: nombre.get(f.proveedorId) ?? "" })),
  };
}

/** Facturas con saldo, la que vence primero arriba; las de contado sin pagar van al final. */
export async function cuentasPorPagar(ctx: Contexto, negocioId: string) {
  exigir(ctx, negocioId);
  const datos = datosDe(ctx);
  const facturas = await datos.facturaCompra.findMany({
    where: { negocioId, estado: "REGISTRADA", estadoPago: { not: "PAGADA" } },
    select: { id: true, numero: true, fecha: true, vencimiento: true, total: true, pagado: true, estadoPago: true, proveedorId: true },
    orderBy: [{ vencimiento: { sort: "asc", nulls: "last" } }, { fecha: "asc" }],
    take: 500,
  });
  const proveedores = await datos.proveedor.findMany({
    where: { id: { in: [...new Set(facturas.map((f) => f.proveedorId))] } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const hoy = fechaDeHoy().getTime();
  const enUnaSemana = hoy + 7 * 24 * 60 * 60 * 1000;
  const filas = facturas.map((f) => {
    const vence = f.vencimiento?.getTime() ?? null;
    return {
      ...f,
      proveedor: nombre.get(f.proveedorId) ?? "",
      saldo: f.total - f.pagado,
      vencida: vence !== null && vence < hoy,
      vencePronto: vence !== null && vence >= hoy && vence <= enUnaSemana,
    };
  });
  const porProveedor = new Map<string, { proveedorId: string; proveedor: string; saldo: number; facturas: number }>();
  for (const f of filas) {
    const p = porProveedor.get(f.proveedorId) ?? { proveedorId: f.proveedorId, proveedor: f.proveedor, saldo: 0, facturas: 0 };
    p.saldo += f.saldo;
    p.facturas += 1;
    porProveedor.set(f.proveedorId, p);
  }
  return {
    facturas: filas,
    total: filas.reduce((a, f) => a + f.saldo, 0),
    vencido: filas.filter((f) => f.vencida).reduce((a, f) => a + f.saldo, 0),
    porProveedor: [...porProveedor.values()].sort((a, b) => b.saldo - a.saldo),
  };
}

export async function obtenerFactura(ctx: Contexto, id: string) {
  exigir(ctx);
  const datos = datosDe(ctx);
  const factura = await datos.facturaCompra.findFirst({
    where: { id },
    select: {
      id: true, negocioId: true, proveedorId: true, usuarioId: true, numero: true, fecha: true, vencimiento: true,
      total: true, pagado: true, estadoPago: true, estado: true, nota: true, anuladaEn: true, anuladaPorId: true,
      motivoAnulacion: true, creadoEn: true,
    },
  });
  if (!factura) return null;
  const [proveedor, detalles, abonos, adjuntos] = await Promise.all([
    datos.proveedor.findFirst({ where: { id: factura.proveedorId }, select: { id: true, nombre: true, nit: true } }),
    datos.detalleFacturaCompra.findMany({
      where: { facturaId: id },
      select: {
        id: true, productoId: true, cantidad: true, costoUnitario: true, total: true, costoAntes: true, costoDespues: true,
        precioAntes: true, precioDespues: true,
      },
      orderBy: { id: "asc" },
    }),
    datos.abonoFactura.findMany({
      where: { facturaId: id },
      select: {
        id: true, valor: true, medio: true, referencia: true, nota: true, cajaId: true, anulado: true, anuladoEn: true,
        usuarioId: true, creadoEn: true,
      },
      orderBy: { creadoEn: "asc" },
    }),
    datos.adjuntoFactura.findMany({
      where: { facturaId: id },
      select: { id: true, nombre: true, tipo: true, tamano: true, creadoEn: true },
      orderBy: { creadoEn: "asc" },
    }),
  ]);
  const [productos, usuarios] = await Promise.all([
    datos.producto.findMany({
      where: { id: { in: detalles.map((d) => d.productoId) } },
      select: { id: true, codigo: true, nombre: true, unidad: true },
    }),
    datos.usuario.findMany({
      where: {
        id: {
          in: [factura.usuarioId, factura.anuladaPorId, ...abonos.map((a) => a.usuarioId)].filter((x): x is string => !!x),
        },
      },
      select: { id: true, nombre: true },
    }),
  ]);
  const producto = new Map(productos.map((p) => [p.id, p]));
  const usuario = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return {
    ...factura,
    proveedor,
    registradaPor: usuario.get(factura.usuarioId) ?? "",
    anuladaPor: factura.anuladaPorId ? (usuario.get(factura.anuladaPorId) ?? "") : null,
    saldo: factura.estado === "ANULADA" ? 0 : factura.total - factura.pagado,
    detalles: detalles.map((d) => ({
      ...d,
      cantidad: d.cantidad.toString(),
      codigo: producto.get(d.productoId)?.codigo ?? "",
      nombre: producto.get(d.productoId)?.nombre ?? "",
      unidad: producto.get(d.productoId)?.unidad ?? "UNIDAD",
    })),
    abonos: abonos.map((a) => ({ ...a, usuario: usuario.get(a.usuarioId) ?? "" })),
    adjuntos,
  };
}

/** Compras de un producto, la más reciente primero: cómo ha cambiado su costo. */
export async function historialComprasProducto(ctx: Contexto, productoId: string) {
  exigir(ctx);
  const datos = datosDe(ctx);
  const detalles = await datos.detalleFacturaCompra.findMany({
    where: { productoId },
    select: { id: true, facturaId: true, cantidad: true, costoUnitario: true, costoAntes: true, costoDespues: true },
    orderBy: { id: "desc" },
    take: 30,
  });
  const facturas = await datos.facturaCompra.findMany({
    where: { id: { in: [...new Set(detalles.map((d) => d.facturaId))] } },
    select: { id: true, numero: true, fecha: true, estado: true, proveedorId: true },
  });
  const proveedores = await datos.proveedor.findMany({
    where: { id: { in: [...new Set(facturas.map((f) => f.proveedorId))] } },
    select: { id: true, nombre: true },
  });
  const factura = new Map(facturas.map((f) => [f.id, f]));
  const proveedor = new Map(proveedores.map((p) => [p.id, p.nombre]));
  return detalles
    .map((d) => {
      const f = factura.get(d.facturaId)!;
      return {
        ...d,
        cantidad: d.cantidad.toString(),
        numero: f.numero,
        fecha: f.fecha,
        anulada: f.estado === "ANULADA",
        proveedor: proveedor.get(f.proveedorId) ?? "",
      };
    })
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

// ─── Adjuntos ───────────────────────────────────────────────────────────────

export const ADJUNTO_MAXIMO = 2 * 1024 * 1024;
export const ADJUNTOS_POR_FACTURA = 3;

/** Tipo real del archivo según sus primeros bytes. */
function tipoDeArchivo(b: Uint8Array) {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function guardarAdjunto(ctx: Contexto, facturaId: string, nombre: string, bytes: Uint8Array): Promise<Resultado> {
  exigir(ctx);
  if (!bytes.byteLength) return { ok: false, error: "El archivo está vacío." };
  if (bytes.byteLength > ADJUNTO_MAXIMO) return { ok: false, error: "El archivo pesa más de 2 MB. Toma la foto de nuevo o usa un PDF más liviano." };
  const tipo = tipoDeArchivo(bytes);
  if (!tipo) return { ok: false, error: "Solo se pueden adjuntar fotos (JPG, PNG, WEBP) o PDF." };
  const datos = datosDe(ctx);
  const factura = await datos.facturaCompra.findFirst({ where: { id: facturaId }, select: { id: true, negocioId: true } });
  if (!factura) return { ok: false, error: "No encontramos esa factura." };
  const cuantos = await datos.adjuntoFactura.count({ where: { facturaId } });
  if (cuantos >= ADJUNTOS_POR_FACTURA) return { ok: false, error: `Cada factura admite máximo ${ADJUNTOS_POR_FACTURA} archivos.` };
  const adjunto = await prisma.adjuntoFactura.create({
    data: {
      empresaId: ctx.empresaId,
      negocioId: factura.negocioId,
      facturaId,
      usuarioId: ctx.usuarioId,
      nombre: nombre.trim().slice(0, 150) || "factura",
      tipo,
      tamano: bytes.byteLength,
      datos: Buffer.from(bytes),
    },
    select: { id: true },
  });
  return { ok: true, id: adjunto.id };
}

export async function obtenerAdjunto(ctx: Contexto, id: string) {
  exigir(ctx);
  return datosDe(ctx).adjuntoFactura.findFirst({ where: { id }, select: { nombre: true, tipo: true, datos: true } });
}

export async function eliminarAdjunto(ctx: Contexto, id: string): Promise<Resultado> {
  exigir(ctx);
  const adjunto = await datosDe(ctx).adjuntoFactura.findFirst({ where: { id }, select: { id: true } });
  if (!adjunto) return { ok: false, error: "No encontramos ese archivo." };
  await prisma.adjuntoFactura.delete({ where: { id: adjunto.id } });
  return { ok: true, id };
}
