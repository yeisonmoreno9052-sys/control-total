import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { cargarContexto, type Contexto } from "@/lib/datos/contexto";
import { cargarSuperadmin, type ContextoEmy } from "@/lib/datos/emy";

export const COOKIE_NEGOCIO = "negocio";

export type ContextoConNegocio = Contexto & {
  /** Negocio que el usuario eligió en el selector. Siempre es uno permitido. */
  negocioActivoId: string | null;
};

/** Contexto de la sesión sin exigir el cambio de contraseña (solo para esa pantalla). */
export const obtenerContextoParaCambio = cache(async () => {
  const sesion = await auth();
  const usuarioId = sesion?.user?.id;
  if (!usuarioId) redirect("/ingresar");

  const ctx = await cargarContexto(usuarioId);
  if (!ctx) {
    // El superadmin de EMY TELECOM no tiene empresa: su lugar es el panel.
    const emy = await cargarSuperadmin(usuarioId);
    if (emy && emy.versionSesion === (sesion.user?.versionSesion ?? 0)) redirect("/emy");
  }
  // Usuario desactivado, o la contraseña se restableció: esta sesión ya no sirve.
  if (!ctx || ctx.versionSesion !== (sesion.user?.versionSesion ?? 0)) redirect("/salir");
  return ctx;
});

/** Superadmin de EMY TELECOM. Cualquier otro usuario se manda a su empresa. */
export const obtenerSuperadmin = cache(async (): Promise<ContextoEmy> => {
  const sesion = await auth();
  const usuarioId = sesion?.user?.id;
  if (!usuarioId) redirect("/ingresar");
  const emy = await cargarSuperadmin(usuarioId);
  if (!emy) redirect("/panel");
  if (emy.versionSesion !== (sesion.user?.versionSesion ?? 0)) redirect("/salir");
  return emy;
});

/**
 * Contexto del usuario que hace la petición. Se usa al inicio de cada página
 * y acción del servidor. Si no hay sesión válida, manda a /ingresar; si tiene
 * una contraseña temporal, a crearla.
 */
export const obtenerContexto = cache(async (): Promise<ContextoConNegocio> => {
  const ctx = await obtenerContextoParaCambio();
  if (ctx.debeCambiarContrasena) redirect("/crear-contrasena");

  const elegido = (await cookies()).get(COOKIE_NEGOCIO)?.value;
  const negocioActivoId =
    elegido && ctx.negociosPermitidos.includes(elegido)
      ? elegido
      : (ctx.negociosPermitidos[0] ?? null);

  return { ...ctx, negocioActivoId };
});
