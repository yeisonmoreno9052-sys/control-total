// Fotos extra de una prenda para el catálogo en línea (espalda, detalle, puesta…).
//
// La foto principal de cada color sigue siendo la del producto (FotoProducto): la que ya
// tiene la tienda no se toca ni se repite. Estas son opcionales y van por prenda y color,
// así al tocar "Negro" en el catálogo se ven todas las fotos de la prenda negra.
import { tipoDeImagen } from "@/lib/imagenes";
import { normalizar } from "@/lib/inventario/prendas";
import { exigirEdicionProductos } from "@/lib/permisos";
import { paraBuscar } from "@/lib/texto";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { FOTO_MAXIMO, urlFoto } from "./fotos-producto";
import { exigirNegocioPermitido, type Resultado } from "./inventario";

/** Fotos extra por color (más la principal: hasta 5 en la galería). */
export const MAX_FOTOS_EXTRA = 4;

const mismoColor = (a: string | null | undefined, b: string | null | undefined) => normalizar(a ?? "") === normalizar(b ?? "");

export function urlFotoCatalogo(id: string) {
  return `/api/fotos-catalogo/${id}`;
}

export type GaleriaColor = {
  color: string | null;
  /** Un producto de ese color: ahí se pone la foto principal si falta. */
  productoId: string;
  principal: string | null;
  extras: { id: string; url: string }[];
};

/** A qué galería pertenece un producto: la prenda completa (o el producto suelto). */
async function productoBase(ctx: Contexto, productoId: string) {
  return datosDe(ctx).producto.findFirst({
    where: { id: String(productoId).slice(0, 40) },
    select: { id: true, negocioId: true, prendaId: true, color: true, fotoEn: true },
  });
}

/** Las fotos de la prenda de este producto, color por color. null si no existe o no es visible. */
export async function obtenerGaleria(ctx: Contexto, productoId: string): Promise<GaleriaColor[] | null> {
  const p = await productoBase(ctx, productoId);
  if (!p) return null;
  const datos = datosDe(ctx);
  const clave = p.prendaId ?? p.id;
  const productos = p.prendaId
    ? await datos.producto.findMany({
        where: { prendaId: p.prendaId, negocioId: p.negocioId, activo: true },
        select: { id: true, color: true, fotoEn: true },
        orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      })
    : [{ id: p.id, color: null, fotoEn: p.fotoEn }];

  const colores: GaleriaColor[] = [];
  for (const x of productos) {
    const g = colores.find((c) => mismoColor(c.color, x.color));
    if (!g) colores.push({ color: x.color, productoId: x.id, principal: urlFoto(x.id, x.fotoEn), extras: [] });
    else if (!g.principal && x.fotoEn) {
      g.principal = urlFoto(x.id, x.fotoEn);
      g.productoId = x.id;
    }
  }
  // El producto que se está editando manda en su color.
  const propio = colores.find((c) => mismoColor(c.color, p.color));
  if (propio && p.fotoEn) {
    propio.productoId = p.id;
    propio.principal = urlFoto(p.id, p.fotoEn);
  }

  const extras = await datos.fotoCatalogo.findMany({
    where: { negocioId: p.negocioId, clave },
    select: { id: true, color: true },
    orderBy: [{ orden: "asc" }, { creadoEn: "asc" }],
  });
  for (const f of extras) {
    const g = colores.find((c) => mismoColor(c.color, f.color));
    if (g) g.extras.push({ id: f.id, url: urlFotoCatalogo(f.id) });
  }
  return colores;
}

/** Agrega una foto extra a la prenda en un color. Quien puede editar productos. */
export async function agregarFotoCatalogo(
  ctx: Contexto,
  productoId: string,
  color: string | null,
  bytes: Uint8Array,
): Promise<Resultado<{ id: string }>> {
  exigirEdicionProductos(ctx);
  const p = await productoBase(ctx, productoId);
  if (!p) return { ok: false, error: "No encontramos ese producto." };
  if (bytes.byteLength > FOTO_MAXIMO) return { ok: false, error: "La foto pesa demasiado. Prueba con otra." };
  const tipo = tipoDeImagen(bytes);
  if (!tipo) return { ok: false, error: "La foto debe ser una imagen PNG, JPG o WEBP." };

  const clave = p.prendaId ?? p.id;
  // El color debe ser uno de la prenda (como está escrito en el producto).
  let colorFinal: string | null = null;
  if (p.prendaId && color) {
    const hermana = await datosDe(ctx).producto.findFirst({
      where: { prendaId: p.prendaId, negocioId: p.negocioId, activo: true, color: { equals: color.trim(), mode: "insensitive" } },
      select: { color: true },
    });
    if (!hermana) return { ok: false, error: "Esa prenda no tiene ese color." };
    colorFinal = hermana.color;
  } else if (p.prendaId) {
    colorFinal = p.color;
  }

  const existentes = await datosDe(ctx).fotoCatalogo.findMany({
    where: { negocioId: p.negocioId, clave },
    select: { color: true, orden: true },
  });
  const delColor = existentes.filter((f) => mismoColor(f.color, colorFinal));
  if (delColor.length >= MAX_FOTOS_EXTRA) {
    return { ok: false, error: `Ya tiene ${MAX_FOTOS_EXTRA} fotos extra en este color. Quita una para poner otra.` };
  }
  const creada = await prisma.fotoCatalogo.create({
    data: {
      empresaId: ctx.empresaId,
      negocioId: p.negocioId,
      clave,
      color: colorFinal,
      orden: Math.max(0, ...delColor.map((f) => f.orden)) + 1,
      tipo,
      datos: Buffer.from(bytes),
    },
    select: { id: true },
  });
  return { ok: true, id: creada.id };
}

/** Quita una foto extra. */
export async function quitarFotoCatalogo(ctx: Contexto, fotoId: string): Promise<Resultado<{ id: string }>> {
  exigirEdicionProductos(ctx);
  const f = await datosDe(ctx).fotoCatalogo.findFirst({ where: { id: String(fotoId).slice(0, 40) }, select: { id: true } });
  if (!f) return { ok: false, error: "Esa foto ya no está." };
  await prisma.fotoCatalogo.delete({ where: { id: f.id } });
  return { ok: true, id: f.id };
}

/** La imagen, si es de un negocio que el usuario puede ver. */
export async function obtenerFotoCatalogo(ctx: Contexto, fotoId: string) {
  const f = await datosDe(ctx).fotoCatalogo.findFirst({ where: { id: String(fotoId).slice(0, 40) }, select: { tipo: true, datos: true } });
  return f ? { tipo: f.tipo, bytes: f.datos } : null;
}

export type FilaGaleria = {
  /** Un producto de ese color: abre la sesión de fotos. */
  productoId: string;
  nombre: string;
  color: string | null;
  principal: string | null;
  extras: number;
};

export const GALERIAS_POR_PAGINA = 30;

/**
 * Las prendas (por color) y los productos sueltos del negocio para la sesión de fotos:
 * primero los que no tienen fotos extra, y entre ellos los más nuevos.
 * Con `q` se busca por nombre o por el código exacto (lo que lee el escáner).
 */
export async function listarGaleriasCatalogo(ctx: Contexto, negocioId: string, opciones: { q?: string; pagina?: number } = {}) {
  exigirNegocioPermitido(ctx, negocioId);
  const datos = datosDe(ctx);
  const q = String(opciones.q ?? "").trim().slice(0, 80);
  const palabras = paraBuscar(q).split(/\s+/).filter(Boolean).slice(0, 6);
  const productos = await datos.producto.findMany({
    where: {
      negocioId,
      activo: true,
      ...(q
        ? {
            OR: [
              { codigo: { equals: q, mode: "insensitive" } },
              { codigoBarras: q },
              { AND: palabras.map((p) => ({ nombreBusqueda: { contains: p } })) },
            ],
          }
        : {}),
    },
    select: { id: true, nombre: true, prendaId: true, prenda: true, color: true, fotoEn: true, creadoEn: true, codigo: true, codigoBarras: true },
    orderBy: [{ creadoEn: "desc" }, { id: "asc" }],
    take: 20_000,
  });
  const porCodigo = q ? productos.find((p) => p.codigo.toLowerCase() === q.toLowerCase() || p.codigoBarras === q) : undefined;

  type Grupo = FilaGaleria & { clave: string; creadoEn: Date };
  const grupos = new Map<string, Grupo>();
  for (const p of productos) {
    const clave = p.prendaId ?? p.id;
    const llave = `${clave}|${normalizar(p.color ?? "")}`;
    const g = grupos.get(llave);
    if (!g) {
      grupos.set(llave, {
        clave,
        productoId: p.id,
        nombre: p.prendaId ? (p.prenda ?? p.nombre) : p.nombre,
        color: p.prendaId ? p.color : null,
        principal: urlFoto(p.id, p.fotoEn),
        extras: 0,
        creadoEn: p.creadoEn,
      });
    } else if (!g.principal && p.fotoEn) {
      g.principal = urlFoto(p.id, p.fotoEn);
      g.productoId = p.id;
    }
  }
  const claves = [...new Set([...grupos.values()].map((g) => g.clave))];
  const conteo = claves.length
    ? await datos.fotoCatalogo.groupBy({ by: ["clave", "color"], where: { negocioId, clave: { in: claves } }, _count: { _all: true } })
    : [];
  for (const c of conteo) {
    const g = grupos.get(`${c.clave}|${normalizar(c.color ?? "")}`);
    if (g) g.extras += c._count._all;
  }
  const todas = [...grupos.values()].sort((a, b) => (a.extras > 0 ? 1 : 0) - (b.extras > 0 ? 1 : 0) || b.creadoEn.getTime() - a.creadoEn.getTime());
  const faltan = todas.filter((g) => g.extras === 0).length;
  const pagina = Math.max(1, Math.floor(Number(opciones.pagina) || 1));
  const filas: FilaGaleria[] = todas
    .slice((pagina - 1) * GALERIAS_POR_PAGINA, pagina * GALERIAS_POR_PAGINA)
    .map(({ productoId, nombre, color, principal, extras }) => ({ productoId, nombre, color, principal, extras }));
  return {
    filas,
    total: todas.length,
    faltan,
    pagina,
    paginas: Math.max(1, Math.ceil(todas.length / GALERIAS_POR_PAGINA)),
    /** Si se escaneó un código exacto: el producto de esa etiqueta. */
    escaneado: porCodigo?.id ?? null,
  };
}

/** La siguiente prenda (por color) que todavía no tiene fotos extra, sin contar esta. */
export async function siguienteSinFotos(ctx: Contexto, negocioId: string, productoId: string) {
  const { filas } = await listarGaleriasCatalogo(ctx, negocioId);
  return filas.find((f) => f.extras === 0 && f.productoId !== productoId)?.productoId ?? null;
}
