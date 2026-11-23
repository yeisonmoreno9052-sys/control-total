"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { anularOperacionPac, NOMBRE_OPERACION_PAC, registrarOperacionPac } from "@/lib/datos/pac";
import { formatearPesos } from "@/lib/formato";
import { leerPesos } from "@/lib/inventario/esquemas";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

export type EstadoPac = { error?: string; campos?: Record<string, string>; ok?: boolean; mensaje?: string; vez?: number };

async function negocioActivo() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) throw new Error("Sin negocio activo");
  return { ctx, negocioId: ctx.negocioActivoId };
}

const esquema = z.object({
  tipo: z.enum(["RECARGA", "RETIRO"]),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA"]).default("EFECTIVO"),
  nota: z.string().max(200).optional().default(""),
});

export async function registrarPacAccion(_: EstadoPac, formulario: FormData): Promise<EstadoPac> {
  const { ctx, negocioId } = await negocioActivo();
  const datos = esquema.safeParse({
    tipo: formulario.get("tipo"),
    medio: formulario.get("medio") || undefined,
    nota: String(formulario.get("nota") ?? "").slice(0, 200),
  });
  if (!datos.success) return { error: "Elige si es recarga o retiro." };
  const valor = leerPesos(String(formulario.get("valor") ?? ""));
  if (!valor || valor <= 0) return { error: "Escribe el valor.", campos: { valor: "Revisa el valor." } };
  const comision = leerPesos(String(formulario.get("comision") ?? "")) ?? 0;
  const r = await registrarOperacionPac(ctx, negocioId, { ...datos.data, valor, comision });
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/ventas/pac");
  revalidatePath("/ventas/caja");
  return {
    ok: true,
    vez: Date.now(),
    mensaje: `${NOMBRE_OPERACION_PAC[datos.data.tipo]} de ${formatearPesos(valor)} guardada. Comisión: ${formatearPesos(comision)}.`,
  };
}

export async function anularPacAccion(id: string, motivo: string) {
  const { ctx } = await negocioActivo();
  const r = await anularOperacionPac(ctx, z.string().max(40).parse(id), z.string().max(300).parse(motivo));
  if (r.ok) {
    revalidatePath("/ventas/pac");
    revalidatePath("/ventas/caja");
  }
  return r;
}
