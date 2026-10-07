import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";

/** Datos de la empresa del usuario para el encabezado y los recibos. */
export function obtenerEmpresa(ctx: Contexto) {
  return datosDe(ctx).empresa.findFirst({
    select: { id: true, nombre: true, logoUrl: true },
  });
}
