import { z } from "zod";
import { exigirGestion } from "@/lib/permisos";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";
import type { Resultado } from "./inventario";

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

const camposRecibo = {
  id: true, nombre: true, razonSocial: true, nit: true, regimen: true, direccion: true, telefono: true, mensajeRecibo: true,
} as const;

export type DatosNegocio = {
  id: string;
  nombre: string;
  razonSocial: string | null;
  nit: string | null;
  regimen: string | null;
  direccion: string | null;
  telefono: string | null;
  mensajeRecibo: string | null;
};

/** Datos que salen en el recibo. */
export function obtenerDatosNegocio(ctx: Contexto, id: string): Promise<DatosNegocio | null> {
  return datosDe(ctx).negocio.findFirst({ where: { id }, select: camposRecibo });
}

const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).transform((v) => v || null);

export const esquemaDatosNegocio = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del negocio.").max(100),
  razonSocial: opcional(150),
  nit: opcional(30),
  regimen: opcional(80),
  direccion: opcional(200),
  telefono: opcional(40),
  mensajeRecibo: opcional(200),
});

export async function guardarDatosNegocio(ctx: Contexto, id: string, entrada: unknown): Promise<Resultado> {
  exigirGestion(ctx);
  const datos = esquemaDatosNegocio.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const { count } = await datosDe(ctx).negocio.updateMany({ where: { id }, data: datos.data });
  return count ? { ok: true, id } : { ok: false, error: "No encontramos ese negocio." };
}
