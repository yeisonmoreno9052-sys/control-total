// Cambio de turno: cuando una cajera entrega la caja a otra en el mismo día.
//
// La caja del día no se cierra: la que se va cuenta el efectivo y el sistema
// guarda cuánto debía haber en ese momento. La diferencia de su turno es la
// diferencia de hoy hasta ese momento, menos lo que ya faltó o sobró en los
// turnos anteriores (para que un faltante de la mañana no se le cargue a la tarde).
import { puedeGestionar } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { resumenDeCaja } from "./caja";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado } from "./inventario";

class ErrorTurno extends Error {}

/** Diferencia propia de un conteo, sabiendo lo acumulado en los turnos anteriores. */
export function diferenciaDelTurno(contado: number, esperado: number, diferenciasAnteriores: number[]) {
  return contado - esperado - diferenciasAnteriores.reduce((a, d) => a + d, 0);
}

/**
 * La cajera que se va cuenta el efectivo. Igual que en el cierre, el cajero lo
 * hace "a ciegas": la respuesta solo trae la diferencia a quien puede gestionar.
 */
export async function entregarTurno(
  ctx: Contexto,
  cajaId: string,
  contado: number,
  nota: string | null,
): Promise<Resultado<{ id: string; diferencia: number | null }>> {
  if (!Number.isInteger(contado) || contado < 0) {
    return { ok: false, error: "Escribe cuánto efectivo contaste.", campos: { contado: "Revisa el valor." } };
  }
  const caja = await datosDe(ctx).caja.findFirst({ where: { id: cajaId }, select: { id: true, negocioId: true, estado: true } });
  if (!caja) return { ok: false, error: "No encontramos esa caja." };
  exigirNegocioPermitido(ctx, caja.negocioId);
  if (caja.estado !== "ABIERTA") return { ok: false, error: "Esta caja ya está cerrada." };

  try {
    const r = await prisma.$transaction(async (tx) => {
      // Bloquea la caja para que el conteo y lo esperado sean del mismo instante.
      const filas = await tx.$queryRaw<{ estado: string }[]>`
        SELECT "estado" FROM "Caja" WHERE "id" = ${cajaId} AND "empresaId" = ${ctx.empresaId} FOR UPDATE`;
      if (filas[0]?.estado !== "ABIERTA") throw new ErrorTurno("Esta caja ya está cerrada.");
      const resumen = (await resumenDeCaja(tx, ctx, cajaId))!;
      const anteriores = await tx.turnoCaja.findMany({
        where: { cajaId, empresaId: ctx.empresaId },
        select: { diferencia: true },
      });
      const diferencia = diferenciaDelTurno(contado, resumen.esperado, anteriores.map((t) => t.diferencia));
      const turno = await tx.turnoCaja.create({
        data: {
          empresaId: ctx.empresaId,
          negocioId: caja.negocioId,
          cajaId,
          usuarioId: ctx.usuarioId,
          esperado: resumen.esperado,
          contado,
          diferencia,
          nota: nota?.trim().slice(0, 300) || null,
        },
        select: { id: true },
      });
      await registrarAuditoria(tx, ctx, {
        negocioId: caja.negocioId,
        accion: "CAMBIO_TURNO",
        entidad: "Caja",
        entidadId: cajaId,
        detalle: { contado, esperado: resumen.esperado, diferencia },
      });
      return { id: turno.id, diferencia };
    });
    return { ok: true, id: r.id, diferencia: puedeGestionar(ctx) ? r.diferencia : null };
  } catch (error) {
    if (error instanceof ErrorTurno) return { ok: false, error: error.message };
    throw error;
  }
}

export type TurnoVista = {
  id: string;
  cajera: string;
  creadoEn: Date;
  esperado: number;
  contado: number;
  diferencia: number;
  nota: string | null;
};

/**
 * Turnos entregados en una caja, y la diferencia del último tramo (desde el
 * último cambio de turno hasta el cierre), si la caja ya se cerró.
 */
export async function turnosDeCaja(ctx: Contexto, cajaId: string) {
  if (!puedeGestionar(ctx)) return { turnos: [] as TurnoVista[], diferenciaUltimo: null };
  const datos = datosDe(ctx);
  const [caja, turnos] = await Promise.all([
    datos.caja.findFirst({ where: { id: cajaId }, select: { diferencia: true, cerradaPorId: true } }),
    datos.turnoCaja.findMany({
      where: { cajaId },
      select: { id: true, usuarioId: true, creadoEn: true, esperado: true, contado: true, diferencia: true, nota: true },
      orderBy: { creadoEn: "asc" },
    }),
  ]);
  if (!caja) return { turnos: [] as TurnoVista[], diferenciaUltimo: null };
  const usuarios = await datos.usuario.findMany({
    where: { id: { in: turnos.map((t) => t.usuarioId) } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return {
    turnos: turnos.map((t) => ({ ...t, cajera: nombre.get(t.usuarioId) ?? "" })),
    diferenciaUltimo:
      caja.diferencia === null || !turnos.length ? null : diferenciaDelTurno(caja.diferencia, 0, turnos.map((t) => t.diferencia)),
  };
}
