// Estados de WhatsApp: datos de las prendas para armar la imagen en el navegador.
import { agruparPiezas, resumirPieza, type PiezaEstado, type VarianteEstado } from "@/lib/estados/piezas";
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
