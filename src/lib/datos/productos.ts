// Consultas de productos. Cada función recibe el contexto del usuario y pasa por
// datosDe(), así que solo ve productos de sus negocios.
//
// El cajero NUNCA recibe el costo: las consultas ni siquiera lo piden a la base.
import { puedeVerCostos } from "@/lib/permisos";
import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";

export const POR_PAGINA = 50;

const camposBase = {
  id: true,
  negocioId: true,
  categoriaId: true,
  codigo: true,
  codigoBarras: true,
  nombre: true,
  descripcion: true,
  precioVenta: true,
  stock: true,
  stockMinimo: true,
  unidad: true,
  fraccionado: true,
  porcentajeIva: true,
  condicion: true,
  activo: true,
} as const;

function campos(ctx: Contexto) {
  return puedeVerCostos(ctx) ? { ...camposBase, costo: true } : camposBase;
}

type Fila = {
  id: string;
  negocioId: string;
  categoriaId: string | null;
  codigo: string;
  codigoBarras: string | null;
  nombre: string;
  descripcion: string | null;
  precioVenta: number;
  stock: { toString(): string };
  stockMinimo: { toString(): string };
  unidad: string;
  fraccionado: boolean;
  porcentajeIva: number;
  condicion: string;
  activo: boolean;
  costo?: number;
};

/** Lo que la pantalla recibe de un producto: datos simples, sin objetos de Prisma. */
export type ProductoVista = ReturnType<typeof aVista>;

function aVista(p: Fila, categorias: Map<string, string>) {
  const stock = p.stock.toString();
  const stockMinimo = p.stockMinimo.toString();
  return {
    id: p.id,
    negocioId: p.negocioId,
    categoriaId: p.categoriaId,
    categoria: p.categoriaId ? (categorias.get(p.categoriaId) ?? null) : null,
    codigo: p.codigo,
    codigoBarras: p.codigoBarras,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precioVenta: p.precioVenta,
    /** undefined para el cajero. */
    costo: p.costo,
    stock,
    stockMinimo,
    stockBajo: Number(stockMinimo) > 0 && Number(stock) <= Number(stockMinimo),
    unidad: p.unidad as import("@/generated/prisma/enums").UnidadMedida,
    fraccionado: p.fraccionado,
    porcentajeIva: p.porcentajeIva,
    condicion: p.condicion as import("@/generated/prisma/enums").CondicionProducto,
    activo: p.activo,
  };
}

async function nombresCategorias(ctx: Contexto, ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unicos.length) return new Map<string, string>();
  const categorias = await datosDe(ctx).categoria.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nombre: true },
  });
  return new Map(categorias.map((c) => [c.id, c.nombre]));
}

export type FiltrosProductos = {
  q?: string;
  categoriaId?: string;
  stockBajo?: boolean;
  pagina?: number;
};

/** Lista paginada y filtrada en el servidor. Pensada para 40.000 productos. */
export async function buscarProductos(ctx: Contexto, negocioId: string, filtros: FiltrosProductos) {
  const datos = datosDe(ctx);
  const q = filtros.q?.trim().slice(0, 100) ?? "";
  const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);

  const where = {
    negocioId,
    activo: true,
    ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
    ...(filtros.stockBajo
      ? { stockMinimo: { gt: 0 }, stock: { lte: datos.producto.fields.stockMinimo } }
      : {}),
    ...(q
      ? {
          OR: [
            { codigo: { equals: q, mode: "insensitive" as const } },
            { codigoBarras: q },
            { codigo: { startsWith: q, mode: "insensitive" as const } },
            { AND: palabras.map((p) => ({ nombre: { contains: p, mode: "insensitive" as const } })) },
          ],
        }
      : {}),
  };

  const pagina = Math.max(1, Math.floor(filtros.pagina ?? 1));
  const [filas, total] = await Promise.all([
    datos.producto.findMany({
      where,
      select: campos(ctx),
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    datos.producto.count({ where }),
  ]);

  const categorias = await nombresCategorias(ctx, filas.map((f) => f.categoriaId));
  return {
    productos: filas.map((f) => aVista(f as Fila, categorias)),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  };
}

/** Para el lector de código de barras: coincidencia exacta de código o código de barras. */
export async function buscarPorCodigoExacto(ctx: Contexto, negocioId: string, codigo: string) {
  const c = codigo.trim();
  if (!c) return null;
  const producto = await datosDe(ctx).producto.findFirst({
    where: {
      negocioId,
      activo: true,
      OR: [{ codigoBarras: c }, { codigo: { equals: c, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  return producto?.id ?? null;
}

/** Un producto por id, o null si no existe o el usuario no tiene acceso. */
export async function obtenerProducto(ctx: Contexto, id: string) {
  const fila = await datosDe(ctx).producto.findFirst({ where: { id }, select: campos(ctx) });
  if (!fila) return null;
  const categorias = await nombresCategorias(ctx, [fila.categoriaId]);
  return aVista(fila as Fila, categorias);
}

/** Cantidad de productos activos con stock en o por debajo del mínimo. */
export function contarStockBajo(ctx: Contexto, negocioId: string) {
  const datos = datosDe(ctx);
  return datos.producto.count({
    where: {
      negocioId,
      activo: true,
      stockMinimo: { gt: 0 },
      stock: { lte: datos.producto.fields.stockMinimo },
    },
  });
}

export function contarProductos(ctx: Contexto, negocioId: string) {
  return datosDe(ctx).producto.count({ where: { negocioId, activo: true } });
}

/** Historial de movimientos de un producto, del más reciente al más antiguo. */
export async function listarMovimientos(ctx: Contexto, productoId: string, pagina = 1) {
  const datos = datosDe(ctx);
  const where = { productoId };
  const [filas, total] = await Promise.all([
    datos.movimientoInventario.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        tipo: true,
        motivo: true,
        nota: true,
        cantidad: true,
        stockAntes: true,
        stockDespues: true,
        usuarioId: true,
        creadoEn: true,
      },
    }),
    datos.movimientoInventario.count({ where }),
  ]);

  const usuarios = await datos.usuario.findMany({
    where: { id: { in: [...new Set(filas.map((f) => f.usuarioId))] } },
    select: { id: true, nombre: true },
  });
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));

  return {
    movimientos: filas.map((m) => ({
      ...m,
      cantidad: m.cantidad.toString(),
      stockAntes: m.stockAntes.toString(),
      stockDespues: m.stockDespues.toString(),
      usuario: nombres.get(m.usuarioId) ?? "—",
    })),
    total,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  };
}

/** Lo que la caja necesita de un producto. Sin costo: el cajero no lo ve. */
export type ProductoCaja = {
  id: string;
  codigo: string;
  nombre: string;
  precioVenta: number;
  porcentajeIva: number;
  unidad: string;
  fraccionado: boolean;
  stock: string;
};

const CAMPOS_CAJA = {
  id: true, codigo: true, nombre: true, precioVenta: true, porcentajeIva: true, unidad: true, fraccionado: true, stock: true,
} as const;

/**
 * Búsqueda de la caja. Si el texto es exactamente un código o código de barras
 * (lo que manda el lector), devuelve ese producto en `exacto` para agregarlo de una.
 */
export async function buscarParaVenta(ctx: Contexto, negocioId: string, texto: string) {
  const q = texto.trim().slice(0, 100);
  if (!q) return { exacto: null, resultados: [] as ProductoCaja[] };
  const datos = datosDe(ctx);
  const aCaja = (p: { stock: { toString(): string } } & Omit<ProductoCaja, "stock">): ProductoCaja => ({
    ...p,
    stock: p.stock.toString(),
  });

  const exacto = await datos.producto.findFirst({
    where: { negocioId, activo: true, OR: [{ codigoBarras: q }, { codigo: { equals: q, mode: "insensitive" } }] },
    select: CAMPOS_CAJA,
  });
  if (exacto) return { exacto: aCaja(exacto), resultados: [aCaja(exacto)] };

  const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const filas = await datos.producto.findMany({
    where: {
      negocioId,
      activo: true,
      OR: [
        { codigo: { startsWith: q, mode: "insensitive" } },
        { AND: palabras.map((p) => ({ nombre: { contains: p, mode: "insensitive" as const } })) },
      ],
    },
    select: CAMPOS_CAJA,
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    take: 8,
  });
  return { exacto: null, resultados: filas.map(aCaja) };
}

/** Precios y stock actuales de los productos del carrito (al recargar la caja o si cambiaron). */
export async function productosParaVenta(ctx: Contexto, negocioId: string, ids: string[]): Promise<ProductoCaja[]> {
  if (!ids.length) return [];
  const filas = await datosDe(ctx).producto.findMany({
    where: { negocioId, activo: true, id: { in: ids.slice(0, 300) } },
    select: CAMPOS_CAJA,
  });
  return filas.map((p) => ({ ...p, stock: p.stock.toString() }));
}
