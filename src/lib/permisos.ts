import type { Rol } from "@/generated/prisma/enums";
import { AccesoDenegado } from "./datos/alcance";
import type { Contexto } from "./datos/contexto";

/** Administrador y socio gestionan; el cajero solo consulta y vende. */
export function puedeGestionar(ctx: Pick<Contexto, "rol">) {
  return ctx.rol === "ADMINISTRADOR" || ctx.rol === "SOCIO";
}

/** El cajero nunca ve costos, márgenes ni utilidades. */
export function puedeVerCostos(ctx: Pick<Contexto, "rol">) {
  return puedeGestionar(ctx);
}

export function exigirRol(ctx: Pick<Contexto, "rol">, roles: Rol[]) {
  if (!roles.includes(ctx.rol)) throw new AccesoDenegado("tu rol no permite esta acción");
}

/**
 * Crear y editar productos: quien gestiona, o un cajero al que el administrador le dio
 * el permiso "Puede crear productos". Ese cajero sigue sin ver ni cambiar costos.
 */
export function puedeEditarProductos(ctx: Pick<Contexto, "rol" | "puedeCrearProductos">) {
  return puedeGestionar(ctx) || (ctx.rol === "CAJERO" && ctx.puedeCrearProductos);
}

export function exigirEdicionProductos(ctx: Pick<Contexto, "rol" | "puedeCrearProductos">) {
  if (!puedeEditarProductos(ctx)) throw new AccesoDenegado("no tienes permiso para crear o editar productos");
}

export function exigirGestion(ctx: Pick<Contexto, "rol">) {
  exigirRol(ctx, ["ADMINISTRADOR", "SOCIO"]);
}
