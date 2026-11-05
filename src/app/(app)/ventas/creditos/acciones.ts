"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { anularAbono, registrarAbono } from "@/lib/datos/creditos";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

async function negocioActivo() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) throw new Error("Sin negocio activo");
  return { ctx, negocioId: ctx.negocioActivoId };
}

export async function registrarAbonoAccion(
  clienteId: string,
  entrada: { valor: number; medio: "EFECTIVO" | "TRANSFERENCIA"; referencia?: string | null; nota?: string | null },
) {
  const { ctx, negocioId } = await negocioActivo();
  const r = await registrarAbono(ctx, negocioId, z.string().max(40).parse(clienteId), entrada);
  if (r.ok) revalidatePath("/ventas", "layout");
  return r;
}

export async function anularAbonoAccion(abonoId: string, motivo: string) {
  const { ctx } = await negocioActivo();
  const r = await anularAbono(ctx, z.string().max(40).parse(abonoId), z.string().max(300).parse(motivo));
  if (r.ok) revalidatePath("/ventas", "layout");
  return r;
}
