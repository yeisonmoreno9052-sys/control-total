// Reportes y panel: ventas, utilidad, productos, inventario valorizado y gastos.
//
// Reglas (ver docs en fase-4-plan.md):
// - Solo administrador y socio; cada uno ve únicamente sus negocios permitidos.
// - Las sumas se hacen en la base (SQL), así es rápido aunque haya años de ventas.
// - Ventas del periodo = ventas no anuladas hechas en esas fechas (hora de Bogotá).
// - Lo devuelto se descuenta de la venta a la que pertenece (por la cantidad devuelta de cada línea).
// - Costo = el guardado en cada línea al momento de vender.
// - IVA: si el negocio es "responsable de IVA", el IVA no es del negocio (es de la DIAN):
//   se toma la base de la venta y el costo sin IVA. Si no es responsable, lo cobrado y el costo completos.
// - Gastos = egresos de caja vigentes, sin el retiro del dueño (no es un gasto del negocio).
import { Prisma } from "@/generated/prisma/client";
import type { CategoriaMovimientoCaja, MedioPago } from "@/generated/prisma/enums";
import { diaEnBogota } from "@/lib/formato";
import { exigirGestion } from "@/lib/permisos";
import { rangoUtc, sumarDias } from "@/lib/reportes/periodos";
import { AccesoDenegado, datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { CATEGORIAS_GASTO } from "./movimientos-caja";

/** "Responsable de IVA" (régimen común) sí; "No responsable de IVA" o vacío, no. */
export function esResponsableIva(regimen: string | null | undefined) {
  const r = (regimen ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return r.includes("responsable") && !/\bno\s+responsable/.test(r);
}

/**
 * Negocios del reporte. "todos" = todos los permitidos (el socio solo suma los suyos).
 * Un id que no es permitido se rechaza; sin valor, el negocio activo.
 */
export function negociosDelReporte(ctx: Contexto, valor: string | undefined | null, negocioActivoId: string | null): string[] {
  exigirGestion(ctx);
  if (valor === "todos") return [...ctx.negociosPermitidos];
  const id = valor || negocioActivoId;
  if (!id || !ctx.negociosPermitidos.includes(id)) throw new AccesoDenegado("negocio no permitido en el reporte");
  return [id];
}

function exigirNegocios(ctx: Contexto, negocioIds: string[]) {
  exigirGestion(ctx);
  if (!negocioIds.length) throw new AccesoDenegado("sin negocios");
  for (const id of negocioIds) if (!ctx.negociosPermitidos.includes(id)) throw new AccesoDenegado("negocio no permitido");
}

async function responsables(ctx: Contexto, negocioIds: string[]) {
  const negocios = await datosDe(ctx).negocio.findMany({
    where: { id: { in: negocioIds } },
    select: { id: true, regimen: true },
  });
  const ids = negocios.filter((n) => esResponsableIva(n.regimen)).map((n) => n.id);
  return ids.length ? ids : [""]; // Prisma.join no acepta listas vacías
}

const num = (v: unknown) => Number(v ?? 0);

// Fragmentos SQL por línea de venta (d = DetalleVenta, v = Venta). Cantidad neta = vendida − devuelta.
const NETO = Prisma.sql`(d."cantidad" - d."cantidadDevuelta") / d."cantidad"`;

function columnasLinea(resp: string[]) {
  const esResp = Prisma.sql`v."negocioId" IN (${Prisma.join(resp)})`;
  return {
    /** Lo vendido que le queda al negocio: base (responsable) o total cobrado, menos lo devuelto. */
    ingreso: Prisma.sql`(CASE WHEN ${esResp} THEN d."base" ELSE d."total" END) * ${NETO}`,
    /** Costo de lo vendido: sin IVA si es responsable. */
    costo: Prisma.sql`(d."cantidad" - d."cantidadDevuelta") * d."costoUnitario" * (CASE WHEN ${esResp} THEN 100.0 / (100 + d."porcentajeIva") ELSE 1 END)`,
    cobrado: Prisma.sql`d."total" * ${NETO}`,
    devuelto: Prisma.sql`d."total" * d."cantidadDevuelta" / d."cantidad"`,
  };
}

function filtroVentas(ctx: Contexto, negocioIds: string[], desde: string, hasta: string) {
  const { inicio, fin } = rangoUtc(desde, hasta);
  return Prisma.sql`v."empresaId" = ${ctx.empresaId} AND v."negocioId" IN (${Prisma.join(negocioIds)})
    AND v."estado" <> 'ANULADA' AND v."creadoEn" >= ${inicio} AND v."creadoEn" < ${fin}`;
}

// ─── Resumen de ventas y utilidad ───────────────────────────────────────────

export type ResumenVentas = {
  ventas: number;
  /** Lo cobrado a los clientes, menos devoluciones (con IVA). */
  totalVendido: number;
  descuentos: number;
  devoluciones: number;
  /** IVA cobrado (neto de devoluciones), de los negocios responsables de IVA. */
  ivaResponsable: number;
  /** Ventas que le quedan al negocio (sin el IVA de los responsables). */
  ventasNetas: number;
  costo: number;
  utilidadBruta: number;
  /** Margen sobre ventas netas, en %. */
  margen: number | null;
  ticketPromedio: number;
  anuladas: number;
  totalAnulado: number;
};

export async function resumenVentas(ctx: Contexto, negocioIds: string[], desde: string, hasta: string): Promise<ResumenVentas> {
  exigirNegocios(ctx, negocioIds);
  const resp = await responsables(ctx, negocioIds);
  const c = columnasLinea(resp);
  const { inicio, fin } = rangoUtc(desde, hasta);
  const [lineas, cabecera, anuladas] = await Promise.all([
    prisma.$queryRaw<{ ingreso: unknown; costo: unknown; cobrado: unknown; devuelto: unknown }[]>`
      SELECT COALESCE(SUM(${c.ingreso}), 0) AS ingreso, COALESCE(SUM(${c.costo}), 0) AS costo,
             COALESCE(SUM(${c.cobrado}), 0) AS cobrado, COALESCE(SUM(${c.devuelto}), 0) AS devuelto
      FROM "DetalleVenta" d JOIN "Venta" v ON v."id" = d."ventaId"
      WHERE d."empresaId" = ${ctx.empresaId} AND ${filtroVentas(ctx, negocioIds, desde, hasta)}`,
    prisma.$queryRaw<{ ventas: unknown; descuentos: unknown }[]>`
      SELECT COUNT(*) AS ventas, COALESCE(SUM(v."descuento"), 0) AS descuentos
      FROM "Venta" v WHERE ${filtroVentas(ctx, negocioIds, desde, hasta)}`,
    prisma.$queryRaw<{ n: unknown; total: unknown }[]>`
      SELECT COUNT(*) AS n, COALESCE(SUM(v."total"), 0) AS total FROM "Venta" v
      WHERE v."empresaId" = ${ctx.empresaId} AND v."negocioId" IN (${Prisma.join(negocioIds)})
        AND v."estado" = 'ANULADA' AND v."creadoEn" >= ${inicio} AND v."creadoEn" < ${fin}`,
  ]);
  const totalVendido = Math.round(num(lineas[0].cobrado));
  const ventasNetas = Math.round(num(lineas[0].ingreso));
  const costo = Math.round(num(lineas[0].costo));
  const ventas = num(cabecera[0].ventas);
  return {
    ventas,
    totalVendido,
    descuentos: num(cabecera[0].descuentos),
    devoluciones: Math.round(num(lineas[0].devuelto)),
    ivaResponsable: totalVendido - ventasNetas,
    ventasNetas,
    costo,
    utilidadBruta: ventasNetas - costo,
    margen: ventasNetas ? Math.round(((ventasNetas - costo) / ventasNetas) * 1000) / 10 : null,
    ticketPromedio: ventas ? Math.round(totalVendido / ventas) : 0,
    anuladas: num(anuladas[0].n),
    totalAnulado: num(anuladas[0].total),
  };
}

/**
 * Utilidad bruta separada entre productos nuevos y de segunda.
 * La condición es la que tiene hoy el producto (casi nunca cambia).
 */
export async function utilidadPorCondicion(ctx: Contexto, negocioIds: string[], desde: string, hasta: string) {
  exigirNegocios(ctx, negocioIds);
  const resp = await responsables(ctx, negocioIds);
  const c = columnasLinea(resp);
  const filas = await prisma.$queryRaw<{ condicion: string; unidades: unknown; ingreso: unknown; costo: unknown }[]>`
    SELECT p."condicion"::text AS condicion, COALESCE(SUM(d."cantidad" - d."cantidadDevuelta"), 0) AS unidades,
           COALESCE(SUM(${c.ingreso}), 0) AS ingreso, COALESCE(SUM(${c.costo}), 0) AS costo
    FROM "DetalleVenta" d JOIN "Venta" v ON v."id" = d."ventaId" JOIN "Producto" p ON p."id" = d."productoId"
    WHERE d."empresaId" = ${ctx.empresaId} AND ${filtroVentas(ctx, negocioIds, desde, hasta)}
    GROUP BY p."condicion"`;
  const de = (condicion: "NUEVO" | "DE_SEGUNDA") => {
    const f = filas.find((x) => x.condicion === condicion);
    const ventasNetas = Math.round(num(f?.ingreso));
    const costo = Math.round(num(f?.costo));
    const utilidad = ventasNetas - costo;
    return {
      unidades: num(f?.unidades),
      ventasNetas,
      costo,
      utilidad,
      margen: ventasNetas ? Math.round((utilidad / ventasNetas) * 1000) / 10 : null,
    };
  };
  return { nuevo: de("NUEVO"), segunda: de("DE_SEGUNDA") };
}

// ─── Ventas por día, cajero y medio de pago ─────────────────────────────────

export async function ventasPorDia(ctx: Contexto, negocioIds: string[], desde: string, hasta: string) {
  exigirNegocios(ctx, negocioIds);
  const resp = await responsables(ctx, negocioIds);
  const c = columnasLinea(resp);
  const filas = await prisma.$queryRaw<{ dia: string; ventas: unknown; total: unknown; utilidad: unknown }[]>`
    SELECT to_char((v."creadoEn" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS dia,
           COUNT(DISTINCT v."id") AS ventas, COALESCE(SUM(${c.cobrado}), 0) AS total,
           COALESCE(SUM(${c.ingreso} - ${c.costo}), 0) AS utilidad
    FROM "DetalleVenta" d JOIN "Venta" v ON v."id" = d."ventaId"
    WHERE d."empresaId" = ${ctx.empresaId} AND ${filtroVentas(ctx, negocioIds, desde, hasta)}
    GROUP BY 1 ORDER BY 1`;
  const porDia = new Map(filas.map((f) => [f.dia, f]));
  const dias: { dia: string; ventas: number; total: number; utilidad: number }[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const f = porDia.get(d);
    dias.push({ dia: d, ventas: num(f?.ventas), total: Math.round(num(f?.total)), utilidad: Math.round(num(f?.utilidad)) });
  }
  return dias;
}

export async function ventasPorCajero(ctx: Contexto, negocioIds: string[], desde: string, hasta: string) {
  exigirNegocios(ctx, negocioIds);
  const resp = await responsables(ctx, negocioIds);
  const c = columnasLinea(resp);
  const filas = await prisma.$queryRaw<{ usuarioId: string; ventas: unknown; total: unknown; descuentos: unknown }[]>`
    SELECT v."usuarioId", COUNT(DISTINCT v."id") AS ventas, COALESCE(SUM(${c.cobrado}), 0) AS total,
           COALESCE(SUM(d."descuento"), 0) AS descuentos
    FROM "DetalleVenta" d JOIN "Venta" v ON v."id" = d."ventaId"
    WHERE d."empresaId" = ${ctx.empresaId} AND ${filtroVentas(ctx, negocioIds, desde, hasta)}
    GROUP BY v."usuarioId" ORDER BY 3 DESC`;
  const usuarios = await datosDe(ctx).usuario.findMany({
    where: { id: { in: filas.map((f) => f.usuarioId) } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return filas.map((f) => ({
    usuario: nombre.get(f.usuarioId) ?? "—",
    ventas: num(f.ventas),
    total: Math.round(num(f.total)),
    descuentos: num(f.descuentos),
  }));
}

export async function ventasPorMedio(ctx: Contexto, negocioIds: string[], desde: string, hasta: string) {
  exigirNegocios(ctx, negocioIds);
  const { inicio, fin } = rangoUtc(desde, hasta);
  const [pagos, devoluciones] = await Promise.all([
    prisma.$queryRaw<{ medio: MedioPago; ventas: unknown; total: unknown }[]>`
      SELECT p."medio", COUNT(DISTINCT v."id") AS ventas, COALESCE(SUM(p."valor"), 0) AS total
      FROM "PagoVenta" p JOIN "Venta" v ON v."id" = p."ventaId"
      WHERE p."empresaId" = ${ctx.empresaId} AND ${filtroVentas(ctx, negocioIds, desde, hasta)}
      GROUP BY p."medio" ORDER BY 3 DESC`,
    // Devoluciones hechas en estas fechas, por el medio por el que salió la plata.
    prisma.$queryRaw<{ medio: MedioPago; total: unknown }[]>`
      SELECT "medio", COALESCE(SUM("total"), 0) AS total FROM "Devolucion"
      WHERE "empresaId" = ${ctx.empresaId} AND "negocioId" IN (${Prisma.join(negocioIds)})
        AND "creadoEn" >= ${inicio} AND "creadoEn" < ${fin}
      GROUP BY "medio"`,
  ]);
  return pagos.map((p) => ({
    medio: p.medio,
    ventas: num(p.ventas),
    total: num(p.total),
    devoluciones: num(devoluciones.find((d) => d.medio === p.medio)?.total),
  }));
}

// ─── Productos ──────────────────────────────────────────────────────────────

export type OrdenProductos = "cantidad" | "total" | "utilidad";

export type ProductoVendido = {
  productoId: string;
  codigo: string;
  nombre: string;
  unidad: string;
  cantidad: string;
  total: number;
  utilidad: number;
};

export async function productosVendidos(
  ctx: Contexto,
  negocioIds: string[],
  desde: string,
  hasta: string,
  orden: OrdenProductos = "total",
  direccion: "mas" | "menos" = "mas",
  limite = 50,
): Promise<ProductoVendido[]> {
  exigirNegocios(ctx, negocioIds);
  const resp = await responsables(ctx, negocioIds);
  const c = columnasLinea(resp);
  const columna = { cantidad: Prisma.sql`3`, total: Prisma.sql`4`, utilidad: Prisma.sql`5` }[orden];
  const sentido = direccion === "mas" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  const filas = await prisma.$queryRaw<
    { productoId: string; codigo: string; nombre: string; cantidad: unknown; total: unknown; utilidad: unknown; unidad: string }[]
  >`
    SELECT d."productoId", MIN(d."codigo") AS codigo,
           SUM(d."cantidad" - d."cantidadDevuelta") AS cantidad,
           COALESCE(SUM(${c.cobrado}), 0) AS total,
           COALESCE(SUM(${c.ingreso} - ${c.costo}), 0) AS utilidad,
           MIN(d."nombre") AS nombre, MIN(d."unidad"::text) AS unidad
    FROM "DetalleVenta" d JOIN "Venta" v ON v."id" = d."ventaId"
    WHERE d."empresaId" = ${ctx.empresaId} AND ${filtroVentas(ctx, negocioIds, desde, hasta)}
    GROUP BY d."productoId"
    HAVING SUM(d."cantidad" - d."cantidadDevuelta") > 0
    ORDER BY ${columna} ${sentido}, 6 ASC
    LIMIT ${Math.min(Math.max(limite, 1), 500)}`;
  return filas.map((f) => ({
    productoId: f.productoId,
    codigo: f.codigo,
    nombre: f.nombre,
    unidad: f.unidad,
    cantidad: String(f.cantidad),
    total: Math.round(num(f.total)),
    utilidad: Math.round(num(f.utilidad)),
  }));
}

/** Productos activos con stock que no se vendieron en el periodo; primero los que más plata tienen quieta. */
export async function productosSinVentas(ctx: Contexto, negocioIds: string[], desde: string, hasta: string, limite = 50) {
  exigirNegocios(ctx, negocioIds);
  const { inicio, fin } = rangoUtc(desde, hasta);
  const [filas, cuenta] = await Promise.all([
    prisma.$queryRaw<{ id: string; codigo: string; nombre: string; unidad: string; stock: unknown; valor: unknown }[]>`
      SELECT p."id", p."codigo", p."nombre", p."unidad"::text AS unidad, p."stock", ROUND(p."stock" * p."costo") AS valor
      FROM "Producto" p
      WHERE p."empresaId" = ${ctx.empresaId} AND p."negocioId" IN (${Prisma.join(negocioIds)}) AND p."activo" AND p."stock" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "DetalleVenta" d JOIN "Venta" v ON v."id" = d."ventaId"
          WHERE d."productoId" = p."id" AND v."estado" <> 'ANULADA' AND v."creadoEn" >= ${inicio} AND v."creadoEn" < ${fin})
      ORDER BY valor DESC, p."nombre" LIMIT ${Math.min(Math.max(limite, 1), 500)}`,
    prisma.$queryRaw<{ n: unknown }[]>`
      SELECT COUNT(*) AS n FROM "Producto" p
      WHERE p."empresaId" = ${ctx.empresaId} AND p."negocioId" IN (${Prisma.join(negocioIds)}) AND p."activo" AND p."stock" > 0
        AND NOT EXISTS (
          SELECT 1 FROM "DetalleVenta" d JOIN "Venta" v ON v."id" = d."ventaId"
          WHERE d."productoId" = p."id" AND v."estado" <> 'ANULADA' AND v."creadoEn" >= ${inicio} AND v."creadoEn" < ${fin})`,
  ]);
  return {
    total: num(cuenta[0].n),
    productos: filas.map((f) => ({ ...f, stock: String(f.stock), valor: num(f.valor) })),
  };
}

// ─── Inventario valorizado ──────────────────────────────────────────────────

export async function inventarioValorizado(ctx: Contexto, negocioIds: string[]) {
  exigirNegocios(ctx, negocioIds);
  const filas = await prisma.$queryRaw<{ categoriaId: string | null; productos: unknown; costo: unknown; venta: unknown }[]>`
    SELECT p."categoriaId", COUNT(*) AS productos,
           COALESCE(SUM(ROUND(p."stock" * p."costo")), 0) AS costo, COALESCE(SUM(ROUND(p."stock" * p."precioVenta")), 0) AS venta
    FROM "Producto" p
    WHERE p."empresaId" = ${ctx.empresaId} AND p."negocioId" IN (${Prisma.join(negocioIds)}) AND p."activo" AND p."stock" > 0
    GROUP BY p."categoriaId" ORDER BY 3 DESC`;
  const categorias = await datosDe(ctx).categoria.findMany({
    where: { id: { in: filas.map((f) => f.categoriaId).filter((x): x is string => !!x) } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(categorias.map((c) => [c.id, c.nombre]));
  const porCategoria = filas.map((f) => ({
    categoria: f.categoriaId ? (nombre.get(f.categoriaId) ?? "—") : "Sin categoría",
    productos: num(f.productos),
    costo: num(f.costo),
    venta: num(f.venta),
  }));
  const suma = (k: "productos" | "costo" | "venta") => porCategoria.reduce((a, f) => a + f[k], 0);
  return { productos: suma("productos"), costo: suma("costo"), venta: suma("venta"), porCategoria };
}

// ─── Gastos ─────────────────────────────────────────────────────────────────

export async function gastosDelPeriodo(ctx: Contexto, negocioIds: string[], desde: string, hasta: string) {
  exigirNegocios(ctx, negocioIds);
  const datos = datosDe(ctx);
  const donde = {
    negocioId: { in: negocioIds },
    anulado: false,
    fecha: { gte: new Date(`${desde}T00:00:00.000Z`), lte: new Date(`${hasta}T00:00:00.000Z`) },
  };
  const [porCategoria, nomina] = await Promise.all([
    datos.movimientoCaja.groupBy({ by: ["categoria"], where: { ...donde, tipo: "EGRESO" }, _sum: { valor: true } }),
    datos.movimientoCaja.groupBy({ by: ["pagadoA"], where: { ...donde, categoria: "NOMINA" }, _sum: { valor: true } }),
  ]);
  const categorias = porCategoria
    .map((g) => ({ categoria: g.categoria as CategoriaMovimientoCaja, valor: g._sum.valor ?? 0 }))
    .sort((a, b) => b.valor - a.valor);
  const gastos = categorias.filter((c) => CATEGORIAS_GASTO.includes(c.categoria)).reduce((a, c) => a + c.valor, 0);
  const retiros = categorias.find((c) => c.categoria === "RETIRO_DUENO")?.valor ?? 0;
  return {
    gastos,
    retiros,
    categorias,
    nomina: nomina
      .map((n) => ({ empleado: n.pagadoA ?? "Sin nombre", valor: n._sum.valor ?? 0 }))
      .sort((a, b) => b.valor - a.valor),
  };
}

/** Utilidad neta = utilidad bruta − gastos (sin retiros del dueño). */
export async function utilidadDelPeriodo(ctx: Contexto, negocioIds: string[], desde: string, hasta: string) {
  const [ventas, gastos] = await Promise.all([
    resumenVentas(ctx, negocioIds, desde, hasta),
    gastosDelPeriodo(ctx, negocioIds, desde, hasta),
  ]);
  return { ventas, gastos, utilidadNeta: ventas.utilidadBruta - gastos.gastos };
}

// ─── Avisos del panel ───────────────────────────────────────────────────────

/** Facturas de proveedores con saldo que vencen en los próximos días o ya vencieron. */
export async function facturasPorVencer(ctx: Contexto, negocioIds: string[], dias = 7) {
  exigirNegocios(ctx, negocioIds);
  const limite = new Date(`${sumarDias(diaEnBogota(), dias)}T00:00:00.000Z`);
  const hoy = new Date(`${diaEnBogota()}T00:00:00.000Z`);
  const facturas = await datosDe(ctx).facturaCompra.findMany({
    where: { negocioId: { in: negocioIds }, estado: "REGISTRADA", estadoPago: { not: "PAGADA" }, vencimiento: { lte: limite } },
    select: { id: true, numero: true, total: true, pagado: true, vencimiento: true, proveedorId: true },
    orderBy: { vencimiento: "asc" },
    take: 200,
  });
  const saldo = facturas.reduce((a, f) => a + f.total - f.pagado, 0);
  const vencidas = facturas.filter((f) => f.vencimiento && f.vencimiento < hoy).length;
  return { facturas: facturas.length, vencidas, saldo };
}

export async function stockBajo(ctx: Contexto, negocioIds: string[]) {
  exigirNegocios(ctx, negocioIds);
  const filas = await prisma.$queryRaw<{ n: unknown }[]>`
    SELECT COUNT(*) AS n FROM "Producto"
    WHERE "empresaId" = ${ctx.empresaId} AND "negocioId" IN (${Prisma.join(negocioIds)})
      AND "activo" AND "stockMinimo" > 0 AND "stock" <= "stockMinimo"`;
  return num(filas[0].n);
}
