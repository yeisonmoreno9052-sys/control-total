// Prendas con tallas y colores: crear la prenda con todas sus combinaciones, agregar
// tallas o colores después, consultar sus variantes y cambiarles el precio a todas.
// Cada combinación es un Producto normal; el stock entra con registrarMovimiento().
import { randomUUID } from "node:crypto";
import {
  claveVariante,
  codigosVariantes,
  combinaciones,
  esquemaAgregarVariantes,
  esquemaPrenda,
  nombreVariante,
  normalizar,
} from "@/lib/inventario/prendas";
import { Decimal } from "@/lib/inventario/cantidades";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { exigirEdicionProductos, exigirGestion, puedeVerCostos } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import {
  exigirNegocioPermitido,
  mensajeDeError,
  registrarAuditoria,
  registrarMovimiento,
  type Resultado,
  type Tx,
} from "./inventario";

/** Siguiente código de prenda PR-0001, PR-0002… del negocio. Llamar con el candado del negocio puesto. */
async function siguienteCodigoPrenda(tx: Tx, negocioId: string) {
  const filas = await tx.$queryRaw<{ n: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("codigo" FROM '^PR-([0-9]{1,9})') AS INTEGER))::int AS n
    FROM "Producto" WHERE "negocioId" = ${negocioId} AND "codigo" ~ '^PR-[0-9]{1,9}(-|$)'`;
  return `PR-${String((filas[0]?.n ?? 0) + 1).padStart(4, "0")}`;
}

async function validarCategoria(ctx: Contexto, negocioId: string, categoriaId: string | null | undefined) {
  if (!categoriaId) return true;
  return !!(await datosDe(ctx).categoria.findFirst({ where: { id: categoriaId, negocioId, activo: true }, select: { id: true } }));
}

type Variante = { talla: string; color: string | null; cantidad: number };

/** Crea los productos de cada combinación y sube su stock. Va dentro de una transacción. */
async function crearVariantes(
  tx: Tx,
  ctx: Contexto,
  negocioId: string,
  prenda: {
    prendaId: string;
    nombre: string;
    base: string;
    descripcion: string | null;
    categoriaId: string | null;
    costo: number;
    precioVenta: number;
    porcentajeIva: number;
    stockMinimo: number;
    tallas: string[];
    colores: string[];
  },
  variantes: Variante[],
) {
  const codigo = codigosVariantes(prenda.base, prenda.tallas, prenda.colores);
  const ids: string[] = [];
  for (const v of variantes) {
    const producto = await tx.producto.create({
      data: {
        empresaId: ctx.empresaId,
        negocioId,
        codigo: codigo(v.talla, v.color),
        nombre: nombreVariante(prenda.nombre, v.talla, v.color),
        descripcion: prenda.descripcion,
        categoriaId: prenda.categoriaId,
        costo: prenda.costo,
        precioVenta: prenda.precioVenta,
        porcentajeIva: prenda.porcentajeIva,
        stockMinimo: String(prenda.stockMinimo),
        unidad: "UNIDAD",
        fraccionado: false,
        prendaId: prenda.prendaId,
        prenda: prenda.nombre,
        talla: v.talla,
        color: v.color,
      },
      select: { id: true },
    });
    if (v.cantidad > 0) {
      await registrarMovimiento(tx, ctx, { productoId: producto.id, tipo: "CREACION", cantidad: new Decimal(v.cantidad) });
    }
    ids.push(producto.id);
  }
  return ids;
}

/**
 * "Nueva prenda": crea una prenda con todas sus tallas y colores de una vez.
 * Cada combinación queda como producto con su código (PR-0001-M-NEG) y su stock inicial.
 */
export async function crearPrenda(
  ctx: Contexto,
  negocioId: string,
  entrada: unknown,
): Promise<Resultado<{ id: string; prendaId: string }>> {
  exigirEdicionProductos(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const r = esquemaPrenda.safeParse(entrada);
  if (!r.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(r.error) };
  const p = r.data;
  // Quien no ve costos crea con costo 0; el administrador lo completa.
  const costo = puedeVerCostos(ctx) ? p.costo : 0;
  if (!(await validarCategoria(ctx, negocioId, p.categoriaId))) {
    return { ok: false, error: "Esa categoría no existe en este negocio.", campos: { categoriaId: "Elige otra." } };
  }
  const variantes = combinaciones(p.tallas, p.colores).map((c) => ({
    ...c,
    cantidad: p.cantidades[claveVariante(c.talla, c.color)] ?? 0,
  }));

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Una prenda a la vez por negocio: así los códigos PR-0001… no se repiten.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`prenda:${negocioId}`}))`;
        const base = await siguienteCodigoPrenda(tx, negocioId);
        const prendaId = randomUUID();
        const ids = await crearVariantes(
          tx,
          ctx,
          negocioId,
          {
            prendaId,
            nombre: p.nombre,
            base,
            descripcion: p.descripcion ?? null,
            categoriaId: p.categoriaId ?? null,
            costo,
            precioVenta: p.precioVenta,
            porcentajeIva: p.porcentajeIva,
            stockMinimo: p.stockMinimo,
            tallas: p.tallas,
            colores: p.colores,
          },
          variantes,
        );
        await registrarAuditoria(tx, ctx, {
          negocioId,
          accion: "CREACION_PRODUCTO",
          entidad: "Producto",
          entidadId: ids[0],
          detalle: {
            codigo: base,
            nombre: p.nombre,
            precioVenta: p.precioVenta,
            tallas: p.tallas.join(", "),
            colores: p.colores.join(", ") || "Sin color",
            unidades: variantes.reduce((a, v) => a + v.cantidad, 0),
          },
        });
        return { ok: true as const, id: ids[0], prendaId };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    const mensaje = mensajeDeError(error);
    if (mensaje) return { ok: false, ...mensaje };
    throw error;
  }
}

export type VariantePrenda = {
  id: string;
  codigo: string;
  codigoBarras: string | null;
  nombre: string;
  talla: string;
  color: string | null;
  precioVenta: number;
  stock: string;
  activo: boolean;
};

/** La prenda y todas sus tallas y colores (también las desactivadas, marcadas). null si no existe. */
export async function obtenerPrenda(ctx: Contexto, prendaId: string) {
  const filas = await datosDe(ctx).producto.findMany({
    where: { prendaId },
    select: {
      id: true,
      negocioId: true,
      codigo: true,
      codigoBarras: true,
      nombre: true,
      prenda: true,
      talla: true,
      color: true,
      precioVenta: true,
      stock: true,
      activo: true,
      creadoEn: true,
    },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
  });
  if (!filas.length) return null;
  const tallas: string[] = [];
  const colores: string[] = [];
  for (const f of filas) {
    if (f.talla && !tallas.some((t) => normalizar(t) === normalizar(f.talla!))) tallas.push(f.talla);
    if (f.color && !colores.some((c) => normalizar(c) === normalizar(f.color!))) colores.push(f.color);
  }
  const variantes: VariantePrenda[] = filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    codigoBarras: f.codigoBarras,
    nombre: f.nombre,
    talla: f.talla ?? "",
    color: f.color,
    precioVenta: f.precioVenta,
    stock: f.stock.toString(),
    activo: f.activo,
  }));
  return {
    prendaId,
    negocioId: filas[0].negocioId,
    nombre: filas[0].prenda ?? filas[0].nombre,
    tallas,
    colores,
    variantes,
    unidades: variantes.filter((v) => v.activo).reduce((a, v) => a + Math.max(0, Number(v.stock)), 0),
  };
}

/** Agrega tallas o colores nuevos a una prenda. Solo crea las combinaciones que faltan. */
export async function agregarVariantes(
  ctx: Contexto,
  prendaId: string,
  entrada: unknown,
): Promise<Resultado<{ id: string; creadas: number }>> {
  exigirEdicionProductos(ctx);
  const r = esquemaAgregarVariantes.safeParse(entrada);
  if (!r.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(r.error) };
  const actual = await datosDe(ctx).producto.findFirst({
    where: { prendaId },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
    select: {
      id: true,
      negocioId: true,
      codigo: true,
      prenda: true,
      nombre: true,
      descripcion: true,
      categoriaId: true,
      costo: true,
      precioVenta: true,
      porcentajeIva: true,
      stockMinimo: true,
    },
  });
  if (!actual) return { ok: false, error: "No encontramos esa prenda." };
  const prenda = await obtenerPrenda(ctx, prendaId);
  if (!prenda) return { ok: false, error: "No encontramos esa prenda." };

  // Las tallas y colores quedan en el orden de antes, con las nuevas al final.
  const tallas = [...prenda.tallas, ...r.data.tallas.filter((t) => !prenda.tallas.some((x) => normalizar(x) === normalizar(t)))];
  const colores = [...prenda.colores, ...r.data.colores.filter((c) => !prenda.colores.some((x) => normalizar(x) === normalizar(c)))];
  if (prenda.colores.length && !colores.length) return { ok: false, error: "Esta prenda maneja colores: escribe al menos uno." };
  if (!prenda.colores.length && colores.length && prenda.variantes.length) {
    return { ok: false, error: "Esta prenda se creó sin colores. Crea una prenda nueva si quieres manejar colores." };
  }
  const existentes = new Set(prenda.variantes.map((v) => claveVariante(v.talla, v.color)));
  const nuevas = combinaciones(tallas, colores)
    .filter((c) => !existentes.has(claveVariante(c.talla, c.color)))
    .map((c) => ({ ...c, cantidad: r.data.cantidades[claveVariante(c.talla, c.color)] ?? 0 }));
  if (!nuevas.length) return { ok: false, error: "Esas tallas y colores ya existen en la prenda." };

  const base = actual.codigo.match(/^PR-\d+/)?.[0] ?? actual.codigo;
  const codigoDe = codigosVariantes(base, tallas, colores);
  const codigosUsados = new Set(prenda.variantes.map((v) => v.codigo.toLowerCase()));
  if (nuevas.some((n) => codigosUsados.has(codigoDe(n.talla, n.color).toLowerCase()))) {
    return { ok: false, error: "Esa talla o color se confunde con uno que ya existe. Escríbelo un poco diferente." };
  }

  try {
    const ids = await prisma.$transaction(
      async (tx) => {
        const creados = await crearVariantes(
          tx,
          ctx,
          actual.negocioId,
          {
            prendaId,
            nombre: actual.prenda ?? actual.nombre,
            base,
            descripcion: actual.descripcion,
            categoriaId: actual.categoriaId,
            costo: actual.costo,
            precioVenta: actual.precioVenta,
            porcentajeIva: actual.porcentajeIva,
            stockMinimo: Number(actual.stockMinimo.toString()),
            tallas,
            colores,
          },
          nuevas,
        );
        await registrarAuditoria(tx, ctx, {
          negocioId: actual.negocioId,
          accion: "CREACION_PRODUCTO",
          entidad: "Producto",
          entidadId: creados[0],
          detalle: {
            codigo: base,
            nombre: actual.prenda ?? actual.nombre,
            agregadas: nuevas.map((n) => nombreVariante("", n.talla, n.color).replace(/^ - /, "")).join(", "),
          },
        });
        return creados;
      },
      { timeout: 30_000 },
    );
    return { ok: true, id: ids[0], creadas: ids.length };
  } catch (error) {
    const mensaje = mensajeDeError(error);
    if (mensaje) return { ok: false, ...mensaje };
    throw error;
  }
}

/** Cambia el precio de venta de todas las tallas y colores de la prenda. */
export async function cambiarPrecioPrenda(ctx: Contexto, prendaId: string, precioVenta: number): Promise<Resultado> {
  exigirGestion(ctx);
  if (!Number.isInteger(precioVenta) || precioVenta <= 0) {
    return { ok: false, error: "El precio de venta debe ser mayor que cero.", campos: { precioVenta: "Escribe un precio." } };
  }
  const filas = await datosDe(ctx).producto.findMany({
    where: { prendaId },
    select: { id: true, negocioId: true, codigo: true, precioVenta: true, prenda: true },
  });
  if (!filas.length) return { ok: false, error: "No encontramos esa prenda." };
  const cambian = filas.filter((f) => f.precioVenta !== precioVenta);
  await prisma.$transaction(async (tx) => {
    for (const f of cambian) {
      await tx.producto.update({ where: { id: f.id }, data: { precioVenta } });
      await registrarAuditoria(tx, ctx, {
        negocioId: f.negocioId,
        accion: "CAMBIO_PRECIO",
        entidad: "Producto",
        entidadId: f.id,
        detalle: { codigo: f.codigo, precioVenta: { antes: f.precioVenta, despues: precioVenta } },
      });
    }
  });
  return { ok: true, id: filas[0].id };
}
