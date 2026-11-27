// Fotos extra de una prenda para el catálogo en línea (espalda, detalle, puesta…).
//
// La foto principal de cada color sigue siendo la del producto (FotoProducto): la que ya
// tiene la tienda no se toca ni se repite. Estas son opcionales y van por prenda y color,
// así al tocar "Negro" en el catálogo se ven todas las fotos de la prenda negra.
import { tipoDeImagen } from "@/lib/imagenes";
import { normalizar } from "@/lib/inventario/prendas";
import { exigirEdicionProductos } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { FOTO_MAXIMO, urlFoto } from "./fotos-producto";
import type { Resultado } from "./inventario";

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
