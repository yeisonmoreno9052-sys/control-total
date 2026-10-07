"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cambiarEstadoUsuario,
  crearUsuario,
  editarUsuario,
  exigirAdministrador,
  restablecerContrasena,
} from "@/lib/datos/usuarios";
import { obtenerContexto } from "@/lib/sesion";

export type EstadoUsuario = { error?: string; campos?: Record<string, string>; ok?: boolean };

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

async function contextoAdmin() {
  const ctx = await obtenerContexto();
  exigirAdministrador(ctx);
  return ctx;
}

export async function guardarUsuarioAccion(_: EstadoUsuario, f: FormData): Promise<EstadoUsuario> {
  const ctx = await contextoAdmin();
  const id = texto(f, "id");
  const datos = {
    nombre: texto(f, "nombre"),
    rol: texto(f, "rol"),
    negocios: f.getAll("negocios").map(String),
  };
  const r = id
    ? await editarUsuario(ctx, id, datos)
    : await crearUsuario(ctx, { ...datos, usuario: texto(f, "usuario"), contrasena: texto(f, "contrasena") });
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/configuracion/usuarios");
  redirect(`/configuracion/usuarios?${id ? "guardado" : "creado"}=${r.id}`);
}

export async function restablecerContrasenaAccion(_: EstadoUsuario, f: FormData): Promise<EstadoUsuario> {
  const ctx = await contextoAdmin();
  const r = await restablecerContrasena(ctx, texto(f, "id"), texto(f, "contrasena"));
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}

export async function cambiarEstadoUsuarioAccion(id: string, activo: boolean): Promise<EstadoUsuario> {
  const ctx = await contextoAdmin();
  const r = await cambiarEstadoUsuario(ctx, String(id), activo === true);
  if (!r.ok) return { error: r.error };
  revalidatePath("/configuracion/usuarios");
  return { ok: true };
}
