"use server";

import { revalidatePath } from "next/cache";
import { guardarLogo, LOGO_MAXIMO } from "@/lib/datos/empresa";
import { guardarDatosNegocio } from "@/lib/datos/negocios";
import { exigirGestion } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";

export type EstadoConfig = { ok?: boolean; error?: string; campos?: Record<string, string> };

export async function guardarNegocioAccion(_: EstadoConfig, formulario: FormData): Promise<EstadoConfig> {
  const ctx = await obtenerContexto();
  exigirGestion(ctx);
  if (!ctx.negocioActivoId) return { error: "No tienes un negocio asignado." };
  const campo = (k: string) => String(formulario.get(k) ?? "");
  const r = await guardarDatosNegocio(ctx, ctx.negocioActivoId, {
    nombre: campo("nombre"),
    razonSocial: campo("razonSocial"),
    nit: campo("nit"),
    regimen: campo("regimen"),
    direccion: campo("direccion"),
    telefono: campo("telefono"),
    mensajeRecibo: campo("mensajeRecibo"),
  });
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function guardarLogoAccion(_: EstadoConfig, formulario: FormData): Promise<EstadoConfig> {
  const ctx = await obtenerContexto();
  const quitar = formulario.get("quitar") === "1";
  const archivo = formulario.get("logo");
  let bytes: Uint8Array | null = null;
  if (!quitar) {
    if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige una imagen para el logo." };
    if (archivo.size > LOGO_MAXIMO) return { error: "El logo pesa más de 300 KB. Usa una imagen más liviana." };
    bytes = new Uint8Array(await archivo.arrayBuffer());
  }
  const r = await guardarLogo(ctx, bytes);
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  return { ok: true };
}
