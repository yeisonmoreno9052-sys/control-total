"use server";

import { revalidatePath } from "next/cache";
import { buscarPiezasEstado, guardarFotoPieza } from "@/lib/datos/estados";
import type { PiezaEstado } from "@/lib/estados/piezas";
import { FOTO_MAXIMO } from "@/lib/datos/fotos-producto";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

/** Foto tomada desde la pantalla del Estado. En una prenda queda en todas sus tallas. */
export async function guardarFotoEstadoAccion(productoId: string, formulario: FormData): Promise<{ error?: string }> {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const archivo = formulario.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige una foto." };
  if (archivo.size > FOTO_MAXIMO) return { error: "La foto pesa demasiado. Prueba con otra." };
  const r = await guardarFotoPieza(ctx, String(productoId).slice(0, 40), new Uint8Array(await archivo.arrayBuffer()));
  if (!r.ok) return { error: r.error };
  revalidatePath("/inventario");
  revalidatePath("/ventas");
  return {};
}

/** Buscar cualquier prenda del negocio para ponerla en el collage. */
export async function buscarPiezasAccion(texto: string): Promise<PiezaEstado[]> {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!ctx.negocioActivoId) return [];
  return buscarPiezasEstado(ctx, ctx.negocioActivoId, String(texto ?? ""));
}
