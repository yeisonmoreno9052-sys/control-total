// PAC (corresponsal): recargas y retiros que hace el local por una comisión.
//
// No son ventas: no cuentan en ventas, ni en la utilidad del negocio, ni en el
// reparto con el socio. Lo único que se gana el local es la comisión.
//
// Efecto en el cajón (la plata se guarda en el mismo cajón del negocio):
//   Recarga pagada en efectivo   → entra  valor + comisión
//   Recarga pagada por transfer. → no toca el cajón
//   Retiro                       → sale   valor − comisión (se le entrega al cliente)
//
// Si toca el cajón, la caja de hoy tiene que estar abierta: el cierre la suma
// o la resta en un renglón aparte ("PAC"). No se borran: se anulan con motivo.
import type { MedioPago, TipoOperacionPac } from "@/generated/prisma/enums";
import { diaEnBogota, fechaDeHoy } from "@/lib/formato";
import { puedeGestionar } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { cajaAbiertaDeHoy } from "./caja";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado, type Tx } from "./inventario";

export const NOMBRE_OPERACION_PAC: Record<TipoOperacionPac, string> = {
  RECARGA: "Recarga",
  RETIRO: "Retiro",
};

/** Comisiones que más se usan: salen como botones. */
export const COMISIONES_RAPIDAS = [1000, 2000, 3000];

const MAXIMO = 50_000_000;

/** Cuánto entra (positivo) o sale (negativo) del cajón con esta operación. */
export function efectoEnCajon(op: { tipo: TipoOperacionPac; medio: MedioPago; valor: number; comision: number }) {
  if (op.tipo === "RETIRO") return -(op.valor - op.comision);
  return op.medio === "EFECTIVO" ? op.valor + op.comision : 0;
}

class ErrorPac extends Error {}

/** Si el negocio tiene activado el PAC. */
export async function negocioUsaPac(ctx: Contexto, negocioId: string) {
  const n = await datosDe(ctx).negocio.findFirst({ where: { id: negocioId }, select: { usaPac: true } });
  return n?.usaPac ?? false;
}

export type EntradaOperacionPac = {
  tipo: TipoOperacionPac;
  valor: number;
  comision: number;
  /** Solo para recargas: cómo pagó el cliente. */
  medio?: MedioPago;
  nota?: string | null;
};

export async function registrarOperacionPac(
  ctx: Contexto,
  negocioId: string,
  entrada: EntradaOperacionPac,
): Promise<Resultado<{ id: string }>> {
  exigirNegocioPermitido(ctx, negocioId);
  if (!(await negocioUsaPac(ctx, negocioId))) return { ok: false, error: "Este negocio no tiene activado el PAC." };
  if (entrada.tipo !== "RECARGA" && entrada.tipo !== "RETIRO") {
    return { ok: false, error: "Elige si es recarga o retiro.", campos: { tipo: "Elige una." } };
  }
  const medio: MedioPago = entrada.tipo === "RETIRO" ? "EFECTIVO" : (entrada.medio ?? "EFECTIVO");
  if (medio !== "EFECTIVO" && medio !== "TRANSFERENCIA") {
    return { ok: false, error: "Elige cómo pagó el cliente.", campos: { medio: "Elige una." } };
  }
  if (!Number.isInteger(entrada.valor) || entrada.valor <= 0) {
    return { ok: false, error: "Escribe el valor.", campos: { valor: "Debe ser mayor que cero." } };
  }
  if (entrada.valor > MAXIMO) return { ok: false, error: "Revisa el valor.", campos: { valor: "Es demasiado grande." } };
  if (!Number.isInteger(entrada.comision) || entrada.comision < 0) {
    return { ok: false, error: "Revisa la comisión.", campos: { comision: "No puede ser negativa." } };
  }
  if (entrada.comision >= entrada.valor) {
    return { ok: false, error: "La comisión debe ser menor que el valor.", campos: { comision: "Es mayor que el valor." } };
  }

  const efecto = efectoEnCajon({ tipo: entrada.tipo, medio, valor: entrada.valor, comision: entrada.comision });
  try {
    return await prisma.$transaction(async (tx) => {
      const caja = await cajaAbiertaDeHoy(tx, ctx, negocioId);
      if (!caja && efecto !== 0) {
        throw new ErrorPac("La caja de hoy no está abierta. Ábrela en Ventas para registrar plata del PAC.");
      }
      const op = await tx.operacionPac.create({
        data: {
          empresaId: ctx.empresaId,
          negocioId,
          tipo: entrada.tipo,
          valor: entrada.valor,
          comision: entrada.comision,
          medio,
          nota: entrada.nota?.trim().slice(0, 200) || null,
          fecha: fechaDeHoy(),
          cajaId: caja?.id ?? null,
          usuarioId: ctx.usuarioId,
        },
        select: { id: true },
      });
      return { ok: true as const, id: op.id };
    });
  } catch (error) {
    if (error instanceof ErrorPac) return { ok: false, error: error.message };
    throw error;
  }
}

/** Cualquiera del negocio puede anular (con motivo), mientras su caja siga abierta. Queda en el historial. */
export async function anularOperacionPac(ctx: Contexto, id: string, motivo: string): Promise<Resultado> {
  const razon = motivo.trim().slice(0, 300);
  if (razon.length < 3) return { ok: false, error: "Escribe el motivo.", campos: { motivo: "Cuéntanos por qué se anula." } };
  const op = await datosDe(ctx).operacionPac.findFirst({
    where: { id },
    select: { id: true, negocioId: true, anulado: true, cajaId: true, tipo: true, valor: true, comision: true, fecha: true },
  });
  if (!op) return { ok: false, error: "No encontramos esa operación." };
  if (op.anulado) return { ok: false, error: "Esa operación ya está anulada." };
  // El cajero solo anula lo de hoy.
  if (!puedeGestionar(ctx) && op.fecha.getTime() !== fechaDeHoy().getTime()) {
    return { ok: false, error: "Solo puedes anular operaciones de hoy." };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      if (op.cajaId) {
        const caja = await tx.$queryRaw<{ estado: string }[]>`SELECT "estado" FROM "Caja" WHERE "id" = ${op.cajaId} FOR SHARE`;
        if (caja[0]?.estado === "CERRADA") {
          throw new ErrorPac("Esa operación pasó por una caja que ya se cerró. Vuelve a abrir esa caja para anularla.");
        }
      }
      const r = await tx.operacionPac.updateMany({
        where: { id: op.id, anulado: false },
        data: { anulado: true, anuladoEn: new Date(), anuladoPorId: ctx.usuarioId, motivoAnulacion: razon },
      });
      if (!r.count) throw new ErrorPac("Esa operación ya está anulada.");
      await registrarAuditoria(tx, ctx, {
        negocioId: op.negocioId,
        accion: "ANULACION_OPERACION_PAC",
        entidad: "OperacionPac",
        entidadId: op.id,
        detalle: { tipo: op.tipo, valor: op.valor, comision: op.comision, motivo: razon },
      });
      return { ok: true as const, id: op.id };
    });
  } catch (error) {
    if (error instanceof ErrorPac) return { ok: false, error: error.message };
    throw error;
  }
}

export type OperacionPacVista = {
  id: string;
  tipo: TipoOperacionPac;
  valor: number;
  comision: number;
  medio: MedioPago;
  nota: string | null;
  fecha: Date;
  creadoEn: Date;
  usuario: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  /** Se puede anular: no está anulada y su caja no se ha cerrado. */
  anulable: boolean;
};

export type TotalesPac = {
  operaciones: number;
  movido: number;
  comisiones: number;
  recargas: number;
  retiros: number;
  /** Lo que el PAC dejó en el cajón (puede ser negativo si hubo más retiros). */
  efectivoNeto: number;
};

export function totalesPac(ops: Pick<OperacionPacVista, "tipo" | "valor" | "comision" | "medio" | "anulado">[]): TotalesPac {
  const t: TotalesPac = { operaciones: 0, movido: 0, comisiones: 0, recargas: 0, retiros: 0, efectivoNeto: 0 };
  for (const o of ops) {
    if (o.anulado) continue;
    t.operaciones++;
    t.movido += o.valor;
    t.comisiones += o.comision;
    if (o.tipo === "RECARGA") t.recargas += o.valor;
    else t.retiros += o.valor;
    t.efectivoNeto += efectoEnCajon(o);
  }
  return t;
}

/**
 * Operaciones del PAC de un negocio entre dos días (incluidos), la más reciente arriba.
 * El cajero solo ve las de hoy.
 */
export async function listarOperacionesPac(
  ctx: Contexto,
  negocioId: string,
  desde: string,
  hasta: string,
): Promise<OperacionPacVista[]> {
  exigirNegocioPermitido(ctx, negocioId);
  if (!puedeGestionar(ctx)) desde = hasta = diaEnBogota();
  const datos = datosDe(ctx);
  const filas = await datos.operacionPac.findMany({
    where: {
      negocioId,
      fecha: { gte: new Date(`${desde}T00:00:00.000Z`), lte: new Date(`${hasta}T00:00:00.000Z`) },
    },
    orderBy: { creadoEn: "desc" },
    take: 3000,
    select: {
      id: true, tipo: true, valor: true, comision: true, medio: true, nota: true, fecha: true, creadoEn: true,
      usuarioId: true, anulado: true, motivoAnulacion: true, cajaId: true,
    },
  });
  const [usuarios, cajas] = await Promise.all([
    datos.usuario.findMany({
      where: { id: { in: [...new Set(filas.map((f) => f.usuarioId))] } },
      select: { id: true, nombre: true },
    }),
    datos.caja.findMany({
      where: { id: { in: [...new Set(filas.map((f) => f.cajaId).filter((x): x is string => !!x))] } },
      select: { id: true, estado: true },
    }),
  ]);
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const cerrada = new Set(cajas.filter((c) => c.estado === "CERRADA").map((c) => c.id));
  const hoy = fechaDeHoy().getTime();
  return filas.map(({ usuarioId, cajaId, ...f }) => ({
    ...f,
    usuario: nombre.get(usuarioId) ?? "",
    anulable:
      !f.anulado && !(cajaId && cerrada.has(cajaId)) && (puedeGestionar(ctx) || f.fecha.getTime() === hoy),
  }));
}

/** Lo del PAC en una caja, para el cierre. */
export async function pacDeCaja(db: Tx, ctx: Contexto, cajaId: string) {
  const ops = await db.operacionPac.findMany({
    where: { empresaId: ctx.empresaId, cajaId, anulado: false },
    select: { tipo: true, medio: true, valor: true, comision: true },
  });
  let entra = 0;
  let sale = 0;
  let comisiones = 0;
  for (const o of ops) {
    const e = efectoEnCajon(o);
    if (e > 0) entra += e;
    else sale -= e;
    comisiones += o.comision;
  }
  return { operaciones: ops.length, entra, sale, comisiones };
}
