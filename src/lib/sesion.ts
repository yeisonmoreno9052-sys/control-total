import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { cargarContexto, type Contexto } from "@/lib/datos/contexto";

export const COOKIE_NEGOCIO = "negocio";

export type ContextoConNegocio = Contexto & {
  /** Negocio que el usuario eligió en el selector. Siempre es uno permitido. */
  negocioActivoId: string | null;
};

/**
 * Contexto del usuario que hace la petición. Se usa al inicio de cada página
 * y acción del servidor. Si no hay sesión válida, manda a /ingresar.
 */
export const obtenerContexto = cache(async (): Promise<ContextoConNegocio> => {
  const sesion = await auth();
  const usuarioId = sesion?.user?.id;
  if (!usuarioId) redirect("/ingresar");

  const ctx = await cargarContexto(usuarioId);
  if (!ctx) redirect("/salir");

  const elegido = (await cookies()).get(COOKIE_NEGOCIO)?.value;
  const negocioActivoId =
    elegido && ctx.negociosPermitidos.includes(elegido)
      ? elegido
      : (ctx.negociosPermitidos[0] ?? null);

  return { ...ctx, negocioActivoId };
});
