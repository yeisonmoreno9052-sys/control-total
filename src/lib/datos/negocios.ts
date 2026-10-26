import { z } from "zod";
import { exigirGestion } from "@/lib/permisos";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { IVAS } from "@/lib/inventario/unidades";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado } from "./inventario";

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
  const antes = await obtenerDatosNegocio(ctx, id);
  if (!antes) return { ok: false, error: "No encontramos ese negocio." };
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({ where: { id: antes.id }, data: datos.data });
    // Solo los campos que cambiaron, para que el historial diga qué se tocó.
    const cambios: Record<string, { antes: string | null; despues: string | null }> = {};
    for (const [campo, valor] of Object.entries(datos.data)) {
      const previo = antes[campo as keyof DatosNegocio];
      if (previo !== valor) cambios[campo] = { antes: previo, despues: valor };
    }
    if (Object.keys(cambios).length) {
      await registrarAuditoria(tx, ctx, {
        negocioId: antes.id,
        accion: "CAMBIO_DATOS_NEGOCIO",
        entidad: "Negocio",
        entidadId: antes.id,
        detalle: { negocio: datos.data.nombre, cambios },
      });
    }
  });
  return { ok: true, id };
}

// ─── Cómo vende el negocio ──────────────────────────────────────────────────

export type PreferenciasVenta = { ivaPorDefecto: number; botonesRapidos: boolean };

/** IVA con el que nacen los productos y si la caja usa botones rápidos. */
export async function obtenerPreferenciasVenta(ctx: Contexto, negocioId: string): Promise<PreferenciasVenta> {
  const n = await datosDe(ctx).negocio.findFirst({
    where: { id: negocioId },
    select: { ivaPorDefecto: true, botonesRapidos: true },
  });
  return n ?? { ivaPorDefecto: 19, botonesRapidos: false };
}

export const esquemaPreferenciasVenta = z.object({
  ivaPorDefecto: z.coerce
    .number()
    .refine((v) => (IVAS as readonly number[]).includes(v), "El IVA debe ser 0, 5 o 19 %."),
  botonesRapidos: z.boolean(),
});

export async function guardarPreferenciasVenta(ctx: Contexto, negocioId: string, entrada: unknown): Promise<Resultado> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const datos = esquemaPreferenciasVenta.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const [antes, negocio] = await Promise.all([obtenerPreferenciasVenta(ctx, negocioId), obtenerNegocio(ctx, negocioId)]);
  if (!negocio) return { ok: false, error: "No encontramos ese negocio." };
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({ where: { id: negocioId }, data: datos.data });
    const cambios: Record<string, { antes: number | boolean; despues: number | boolean }> = {};
    for (const [campo, valor] of Object.entries(datos.data)) {
      const previo = antes[campo as keyof PreferenciasVenta];
      if (previo !== valor) cambios[campo] = { antes: previo, despues: valor };
    }
    if (Object.keys(cambios).length) {
      await registrarAuditoria(tx, ctx, {
        negocioId,
        accion: "CAMBIO_DATOS_NEGOCIO",
        entidad: "Negocio",
        entidadId: negocioId,
        detalle: { negocio: negocio.nombre, cambios },
      });
    }
  });
  return { ok: true, id: negocioId };
}
