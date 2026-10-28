// Fotos de los productos (cuadros de la caja, inventario). La tablet o el computador
// achican la foto antes de subirla; aquí solo se revisa que sea una imagen liviana.
import { tipoDeImagen } from "@/lib/imagenes";
import { exigirEdicionProductos } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, type Resultado } from "./inventario";

export const FOTO_MAXIMO = 200 * 1024;

/** Dirección de la foto. La versión hace que el navegador pida la nueva cuando cambia. */
export function urlFoto(productoId: string, fotoEn: Date | null) {
  return fotoEn ? `/api/productos/${productoId}/foto?v=${fotoEn.getTime()}` : null;
}

/** Pone, cambia o quita (null) la foto de un producto. Quien puede editar productos. */
export async function guardarFotoProducto(ctx: Contexto, productoId: string, bytes: Uint8Array | null): Promise<Resultado> {
  exigirEdicionProductos(ctx);
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

/** Para comparar nombres sin fijarse en tildes, mayúsculas, espacios ni signos ("Gaseosa 1,5 L" = "gaseosa 15 l"). */
function comparable(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Para subir muchas fotos de una vez: el nombre del archivo dice de qué producto es.
 * Sirve "Tinto.jpg" o "C001 Tinto.jpg" (se busca por el nombre) y "C001.jpg" (solo el código).
 * Si el archivo trae un nombre, manda el nombre: así una foto nunca cae en otro producto
 * cuando los códigos de la tienda no son los mismos del archivo.
 */
export async function guardarFotoPorArchivo(
  ctx: Contexto,
  negocioId: string,
  nombreArchivo: string,
  bytes: Uint8Array,
): Promise<Resultado<{ id: string; producto: string }>> {
  exigirEdicionProductos(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const base = nombreArchivo.normalize("NFC").replace(/\.[a-z0-9]+$/i, "").trim();
  const partes = base.split(/\s+/).filter(Boolean);
  if (!partes.length) return { ok: false, error: "El archivo no tiene nombre." };

  let producto: { id: string; nombre: string } | null = null;
  // Primero el nombre completo del archivo y, si empieza con un código, lo que sigue.
  for (const nombre of partes.length > 1 ? [base, partes.slice(1).join(" ")] : [base]) {
    const buscado = comparable(nombre);
    const pista = comparable(nombre.split(/\s+/)[0] ?? "");
    if (!pista) continue;
    // Se busca sin tildes ("Cafe" encuentra "Café"); el filtro de empresa y negocio va explícito.
    const candidatos = await prisma.$queryRaw<{ id: string; nombre: string }[]>`
      SELECT id, nombre FROM "Producto"
      WHERE "empresaId" = ${ctx.empresaId} AND "negocioId" = ${negocioId} AND activo
        AND translate(lower(nombre), 'áéíóúüñ', 'aeiouun') LIKE ${"%" + pista + "%"}
      LIMIT 200`;
    producto = candidatos.find((c) => comparable(c.nombre) === buscado) ?? null;
    if (producto) break;
  }
  // Un archivo con solo el código ("C001.jpg").
  if (!producto && partes.length === 1) {
    producto = await datosDe(ctx).producto.findFirst({
      where: { negocioId, activo: true, codigo: { equals: base, mode: "insensitive" } },
      select: { id: true, nombre: true },
    });
  }
  if (!producto) return { ok: false, error: "No encontramos un producto con ese nombre o código." };
  const r = await guardarFotoProducto(ctx, producto.id, bytes);
  return r.ok ? { ok: true, id: r.id, producto: producto.nombre } : r;
}

/** La foto, si el producto es de un negocio que el usuario puede ver (el cajero también). */
export async function obtenerFotoProducto(ctx: Contexto, productoId: string) {
  const foto = await datosDe(ctx).fotoProducto.findFirst({ where: { productoId }, select: { tipo: true, datos: true } });
  return foto ? { tipo: foto.tipo, bytes: foto.datos } : null;
}
