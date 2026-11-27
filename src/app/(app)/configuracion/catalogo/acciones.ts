"use server";

import { revalidatePath } from "next/cache";
import { guardarConfigCatalogo, marcarAvisado } from "@/lib/datos/catalogo";
import { exigirGestion } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";

export type EstadoCatalogo = { ok?: boolean; error?: string; campos?: Record<string, string> };

export async function guardarCatalogoAccion(_: EstadoCatalogo, formulario: FormData): Promise<EstadoCatalogo> {
  const ctx = await obtenerContexto();
  exigirGestion(ctx);
  if (!ctx.negocioActivoId) return { error: "No tienes un negocio asignado." };
  const r = await guardarConfigCatalogo(ctx, ctx.negocioActivoId, {
    activo: formulario.get("activo") === "on",
    slug: String(formulario.get("slug") ?? ""),
    whatsapp: String(formulario.get("whatsapp") ?? ""),
    mostrarCantidad: formulario.get("mostrarCantidad") === "on",
    marcaAgua: formulario.get("marcaAgua") === "on",
  });
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/configuracion/catalogo");
  return { ok: true };
}

/** Se le escribió al cliente que esperaba la talla: sale de la lista. */
export async function marcarAvisadoAccion(avisoId: string) {
  const ctx = await obtenerContexto();
  const r = await marcarAvisado(ctx, avisoId);
  revalidatePath("/configuracion/catalogo");
  revalidatePath("/inventario/prenda", "layout");
  return r;
}
