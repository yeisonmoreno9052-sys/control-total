"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FOTO_MAXIMO, FOTOS_POR_TANDA, guardarProductosDeFotos, leerProductosConFoto, PRODUCTOS_POR_ENVIO } from "@/lib/datos/lectura-productos";
import { obtenerLectorProductos } from "@/lib/ia/lector";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

async function negocioActivo() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!ctx.negocioActivoId) throw new Error("Sin negocio activo");
  return { ctx, negocioId: ctx.negocioActivoId };
}

/** Lee una tanda de fotos con IA y devuelve los productos propuestos. No guarda nada. */
export async function leerProductosFotoAccion(f: FormData) {
  const { ctx, negocioId } = await negocioActivo();
  const fotos = f.getAll("foto").filter((a): a is File => a instanceof File);
  if (fotos.length > FOTOS_POR_TANDA) return { ok: false as const, error: `Lee máximo ${FOTOS_POR_TANDA} fotos a la vez.` };
  const bytes = await Promise.all(fotos.map(async (h) => new Uint8Array(await h.arrayBuffer())));
  return leerProductosConFoto(ctx, negocioId, bytes, await obtenerLectorProductos());
}

const esquemaRevisados = z
  .array(
    z.object({
      clave: z.string().min(1).max(60),
      accion: z.enum(["crear", "sumar"]),
      productoId: z.string().max(40).nullable(),
      nombre: z.string().trim().min(1, "Escribe el nombre.").max(150),
      codigoBarras: z.string().max(60).nullable(),
      categoriaId: z.string().max(40).nullable(),
      categoriaNueva: z.string().max(80).nullable(),
      precioVenta: z.number().int().min(0).max(1_000_000_000),
      costo: z.number().int().min(0).max(1_000_000_000),
      cantidad: z.string().max(20),
    }),
  )
  .max(PRODUCTOS_POR_ENVIO);

/** Guarda una parte de los productos revisados (con sus fotos ya achicadas). */
export async function guardarProductosFotoAccion(f: FormData) {
  const { ctx, negocioId } = await negocioActivo();
  let crudo: unknown;
  try {
    crudo = JSON.parse(String(f.get("productos") ?? "[]"));
  } catch {
    return { ok: false as const, error: "No pudimos leer los productos. Intenta de nuevo." };
  }
  const items = esquemaRevisados.safeParse(crudo);
  if (!items.success) return { ok: false as const, error: items.error.issues[0]?.message ?? "Revisa los productos." };
  const fotos = new Map<string, Uint8Array>();
  for (const item of items.data) {
    const archivo = f.get(`foto:${item.clave}`);
    if (archivo instanceof File && archivo.size > 0 && archivo.size <= FOTO_MAXIMO) {
      fotos.set(item.clave, new Uint8Array(await archivo.arrayBuffer()));
    }
  }
  const resultados = await guardarProductosDeFotos(ctx, negocioId, items.data, fotos);
  revalidatePath("/inventario");
  revalidatePath("/ventas");
  return { ok: true as const, resultados };
}
