import type { Modulo } from "@/generated/prisma/enums";
import { AccesoDenegado } from "./datos/alcance";
import type { Contexto } from "./datos/contexto";

/** Un módulo apagado no aparece en el menú ni responde en el servidor. */
export function tieneModulo(ctx: Contexto, modulo: Modulo) {
  return ctx.modulosActivos.includes(modulo);
}

/** Úsalo al inicio de cada página o acción de un módulo. */
export function exigirModulo(ctx: Contexto, modulo: Modulo) {
  if (!tieneModulo(ctx, modulo)) throw new AccesoDenegado(`el módulo ${modulo} no está activo`);
}
