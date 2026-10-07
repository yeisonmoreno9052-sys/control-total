import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";

const campos = { id: true, nombre: true, tipo: true, direccion: true } as const;

/** Negocios activos que el usuario puede ver, en orden alfabético. */
export function listarNegocios(ctx: Contexto) {
  return datosDe(ctx).negocio.findMany({
    where: { activo: true },
    select: campos,
    orderBy: { nombre: "asc" },
  });
}

/** Un negocio por id, o null si no existe o el usuario no tiene acceso. */
export function obtenerNegocio(ctx: Contexto, id: string) {
  return datosDe(ctx).negocio.findFirst({ where: { id, activo: true }, select: campos });
}
