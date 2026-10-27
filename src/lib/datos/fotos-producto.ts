// Fotos de los productos (cuadros de la caja, inventario). La tablet o el computador
// achican la foto antes de subirla; aquí solo se revisa que sea una imagen liviana.
import { tipoDeImagen } from "@/lib/imagenes";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import type { Resultado } from "./inventario";

export const FOTO_MAXIMO = 200 * 1024;

/** Dirección de la foto. La versión hace que el navegador pida la nueva cuando cambia. */
export function urlFoto(productoId: string, fotoEn: Date | null) {
  return fotoEn ? `/api/productos/${productoId}/foto?v=${fotoEn.getTime()}` : null;
}

/** Pone, cambia o quita (null) la foto de un producto. Solo quien gestiona el inventario. */
export async function guardarFotoProducto(ctx: Contexto, productoId: string, bytes: Uint8Array | null): Promise<Resultado> {
  exigirGestion(ctx);
  const producto = await datosDe(ctx).producto.findFirst({ where: { id: productoId }, select: { id: true, negocioId: true } });
  if (!producto) return { ok: false, error: "No encontramos ese producto." };

  let tipo: string | null = null;
  if (bytes) {
    if (bytes.byteLength > FOTO_MAXIMO) return { ok: false, error: "La foto pesa demasiado. Prueba con otra." };
    tipo = tipoDeImagen(bytes);
    if (!tipo) return { ok: false, error: "La foto debe ser una imagen PNG, JPG o WEBP." };
  }

  await prisma.$transaction(async (tx) => {
    if (bytes && tipo) {
      const datos = Buffer.from(bytes);
      await tx.fotoProducto.upsert({
        where: { productoId: producto.id },
        create: { productoId: producto.id, empresaId: ctx.empresaId, negocioId: producto.negocioId, tipo, datos },
        update: { tipo, datos },
      });
    } else {
      await tx.fotoProducto.deleteMany({ where: { productoId: producto.id } });
    }
    // Cambiar fotoEn también mueve actualizadoEn: la caja sin internet se entera del cambio.
    await tx.producto.update({ where: { id: producto.id }, data: { fotoEn: bytes ? new Date() : null } });
  });
  return { ok: true, id: producto.id };
}

/** La foto, si el producto es de un negocio que el usuario puede ver (el cajero también). */
export async function obtenerFotoProducto(ctx: Contexto, productoId: string) {
  const foto = await datosDe(ctx).fotoProducto.findFirst({ where: { productoId }, select: { tipo: true, datos: true } });
  return foto ? { tipo: foto.tipo, bytes: foto.datos } : null;
}
