"use server";

import { revalidatePath } from "next/cache";
import { buscarParaPromocion, crearPromocion, terminarPromocion, type OpcionPromocion } from "@/lib/datos/promociones";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

async function contextoPromo() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  return ctx;
}

export async function buscarParaPromocionAccion(texto: string): Promise<OpcionPromocion[]> {
  const ctx = await contextoPromo();
  if (!ctx.negocioActivoId) return [];
  return buscarParaPromocion(ctx, ctx.negocioActivoId, String(texto ?? ""));
}

export async function crearPromocionAccion(datos: unknown): Promise<{ ok: true; productos: number } | { ok: false; error: string }> {
  const ctx = await contextoPromo();
  if (!ctx.negocioActivoId) return { ok: false, error: "Elige un negocio primero." };
  const r = await crearPromocion(ctx, ctx.negocioActivoId, datos);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/inventario/promociones");
  return { ok: true, productos: r.productos };
}

export async function terminarPromocionAccion(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await contextoPromo();
  const r = await terminarPromocion(ctx, String(id));
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/inventario/promociones");
  return { ok: true };
}
