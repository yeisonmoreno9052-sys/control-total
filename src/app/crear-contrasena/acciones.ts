"use server";

import { redirect } from "next/navigation";
import type { EstadoContrasena } from "@/components/cuenta/formulario-contrasena";
import { crearMiContrasena } from "@/lib/datos/usuarios";
import { obtenerContextoParaCambio } from "@/lib/sesion";

export async function crearContrasenaAccion(_: EstadoContrasena, f: FormData): Promise<EstadoContrasena> {
  const ctx = await obtenerContextoParaCambio();
  if (!ctx.debeCambiarContrasena) redirect("/panel");
  const r = await crearMiContrasena(ctx, { nueva: String(f.get("nueva") ?? ""), repetir: String(f.get("repetir") ?? "") });
  if (!r.ok) return { error: r.error, campos: r.campos };
  // El cajero trabaja en la caja; los demás, en el inicio.
  redirect(ctx.rol === "CAJERO" ? "/ventas" : "/panel");
}
