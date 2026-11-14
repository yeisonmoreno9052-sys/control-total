// Estados de WhatsApp: datos de las prendas para armar la imagen en el navegador.
import { agruparPiezas, resumirPieza, type PiezaEstado, type VarianteEstado } from "@/lib/estados/piezas";
import { paraBuscar } from "@/lib/texto";
import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";
import { guardarFotoProducto, urlFoto } from "./fotos-producto";
import type { Resultado } from "./inventario";

const campos = {
  id: true,
  nombre: true,
  prenda: true,
  prendaId: true,
  descripcion: true,
  talla: true,
  precioVenta: true,
  stock: true,
  controlaStock: true,
  fotoEn: true,
} as const;

type Fila = {
  id: string;
  nombre: string;
  prenda: string | null;
  prendaId: string | null;
  descripcion: string | null;
  talla: string | null;
  precioVenta: number;
  stock: { toString(): string };
  controlaStock: boolean;
  fotoEn: Date | null;
};

const aVariante = (f: Fila): VarianteEstado => ({
  id: f.id,
  nombre: f.nombre,
  prenda: f.prenda,
  prendaId: f.prendaId,
  descripcion: f.descripcion,
  talla: f.talla,
  precioVenta: f.precioVenta,
  stock: f.stock.toString(),
  controlaStock: f.controlaStock,
  fotoUrl: urlFoto(f.id, f.fotoEn),
});

/**
 * La prenda o el producto para publicar, a partir de cualquiera de sus tallas.
 * En una prenda junta todas las tallas activas (solo salen las que tienen stock).
 */
export async function obtenerPiezaEstado(
  ctx: Contexto,
  productoId: string,
): Promise<(PiezaEstado & { negocioId: string }) | null> {
  const datos = datosDe(ctx);
  const producto = await datos.producto.findFirst({
    where: { id: productoId },
    select: { ...campos, negocioId: true },
  });
  if (!producto) return null;
  const filas: Fila[] = producto.prendaId
    ? await datos.producto.findMany({
        where: {
          prendaId: producto.prendaId,
          negocioId: producto.negocioId,
          activo: true,
        },
        select: campos,
        orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      })
    : [producto];
  const pieza = resumirPieza((filas.length ? filas : [producto]).map(aVariante));
  return pieza && { ...pieza, negocioId: producto.negocioId };
}

/** Lo último que entró al negocio y tiene stock, agrupado por prenda (para el collage). */
export async function listarNovedades(ctx: Contexto, negocioId: string, limite = 30): Promise<PiezaEstado[]> {
  const filas = await datosDe(ctx).producto.findMany({
    where: {
      negocioId,
      activo: true,
      OR: [{ stock: { gt: 0 } }, { controlaStock: false }],
    },
    select: campos,
    orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
    take: 400,
  });
  return agruparPiezas(filas.map(aVariante), limite);
}

/**
 * Busca prendas o productos por nombre o código para el collage (cualquiera, no solo lo
 * nuevo). Una prenda sale con todas sus tallas aunque el texto coincida con una sola.
 */
export async function buscarPiezasEstado(ctx: Contexto, negocioId: string, texto: string, limite = 30): Promise<PiezaEstado[]> {
  const q = texto.trim().slice(0, 80);
  const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (!palabras.length) return [];
  const datos = datosDe(ctx);
  const encontrados = await datos.producto.findMany({
    where: {
      negocioId,
      activo: true,
      OR: [
        { codigo: { startsWith: q, mode: "insensitive" } },
        { codigoBarras: q },
        { AND: palabras.map((p) => ({ nombreBusqueda: { contains: paraBuscar(p) } })) },
      ],
    },
    select: campos,
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    take: 200,
  });
  // Las prendas se completan con todas sus tallas (para saber cuáles tienen stock).
  const prendaIds = [...new Set(encontrados.map((f) => f.prendaId).filter((id): id is string => !!id))];
  const tallas = prendaIds.length
    ? await datos.producto.findMany({
        where: { negocioId, activo: true, prendaId: { in: prendaIds } },
        select: campos,
        orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      })
    : [];
  const grupos = new Map<string, Fila[]>();
  for (const f of encontrados) {
    const clave = f.prendaId ? `prenda:${f.prendaId}` : `producto:${f.id}`;
    if (grupos.has(clave)) continue;
    if (grupos.size >= limite) break;
    grupos.set(clave, f.prendaId ? tallas.filter((t) => t.prendaId === f.prendaId) : [f]);
  }
  return [...grupos.values()].map((g) => resumirPieza(g.map(aVariante))).filter((p): p is PiezaEstado => !!p);
}

/**
 * Pone la foto desde la pantalla del Estado. En una prenda la foto queda en todas sus
 * tallas y colores, para que salga igual en la caja y en el inventario.
 */
export async function guardarFotoPieza(ctx: Contexto, productoId: string, bytes: Uint8Array): Promise<Resultado> {
  const datos = datosDe(ctx);
  const producto = await datos.producto.findFirst({
    where: { id: productoId },
    select: { id: true, prendaId: true, negocioId: true },
  });
  if (!producto) return { ok: false, error: "No encontramos ese producto." };
  const ids = producto.prendaId
    ? (
        await datos.producto.findMany({
          where: {
            prendaId: producto.prendaId,
            negocioId: producto.negocioId,
            activo: true,
          },
          select: { id: true },
        })
      ).map((v) => v.id)
    : [producto.id];
  for (const id of ids.length ? ids : [producto.id]) {
    const r = await guardarFotoProducto(ctx, id, bytes);
    if (!r.ok) return r;
  }
  return { ok: true, id: producto.id };
}
