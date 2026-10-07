"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { anularMovimientoCaja, CATEGORIAS_CAJA, registrarMovimientoCaja } from "@/lib/datos/movimientos-caja";
import { exigirModulo } from "@/lib/modulos";
import { exigirGestion } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";

export type EstadoAccion = { error?: string; campos?: Record<string, string> };

async function contextoCaja() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "CAJA");
  exigirGestion(ctx);
  return ctx;
}

const esquema = z.object({
  categoria: z.enum(Object.keys(CATEGORIAS_CAJA) as [keyof typeof CATEGORIAS_CAJA, ...(keyof typeof CATEGORIAS_CAJA)[]]),
  valor: z.coerce.number().int().min(0).max(2_000_000_000),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA"]),
  fecha: z.string().max(10),
  pagadoA: z.string().max(80).optional(),
  nota: z.string().max(300).optional(),
  desdeCaja: z.string().optional(),
});

export async function registrarMovimientoAccion(_: EstadoAccion, f: FormData): Promise<EstadoAccion> {
  const ctx = await contextoCaja();
  if (!ctx.negocioActivoId) return { error: "No tienes un negocio elegido." };
  const datos = esquema.safeParse(Object.fromEntries(f));
  if (!datos.success) {
    const campo = String(datos.error.issues[0]?.path[0] ?? "");
    return { error: "Revisa los datos.", campos: campo ? { [campo]: "Revisa este dato." } : undefined };
  }
  const { desdeCaja, ...resto } = datos.data;
  const r = await registrarMovimientoCaja(ctx, ctx.negocioActivoId, { ...resto, desdeCaja: desdeCaja === "on" });
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/caja");
  revalidatePath("/ventas", "layout");
  redirect(`/caja?registrado=${CATEGORIAS_CAJA[resto.categoria].tipo === "EGRESO" ? "egreso" : "ingreso"}`);
}

export async function anularMovimientoAccion(id: string, motivo: string) {
  const ctx = await contextoCaja();
  const r = await anularMovimientoCaja(ctx, z.string().max(40).parse(id), z.string().max(300).parse(motivo));
  if (r.ok) {
    revalidatePath("/caja");
    revalidatePath("/ventas", "layout");
  }
  return r;
}
