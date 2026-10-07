"use server";

import type { EstadoContrasena } from "@/components/cuenta/formulario-contrasena";
import { cambiarMiContrasena } from "@/lib/datos/usuarios";
import { obtenerContexto } from "@/lib/sesion";

export async function cambiarMiContrasenaAccion(_: EstadoContrasena, f: FormData): Promise<EstadoContrasena> {
  const ctx = await obtenerContexto();
  const r = await cambiarMiContrasena(ctx, {
    actual: String(f.get("actual") ?? ""),
    nueva: String(f.get("nueva") ?? ""),
    repetir: String(f.get("repetir") ?? ""),
  });
  if (!r.ok) return { error: r.error, campos: r.campos };
  return { ok: true };
}
