// Ingresos y egresos que no son ventas: nómina, arriendo, servicios, retiros del dueño…
//
// - Si es en efectivo y es de hoy, por defecto entra o sale de la caja abierta de hoy:
//   el cierre de caja lo suma o lo resta.
// - No se borran: se anulan con motivo y queda en la auditoría.
// - El retiro del dueño se ve en la caja pero no es un gasto del negocio (no baja la utilidad).
import type { CategoriaMovimientoCaja, MedioPago, TipoMovimientoCaja } from "@/generated/prisma/enums";
import { diaEnBogota } from "@/lib/formato";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { cajaAbiertaDeHoy } from "./caja";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado } from "./inventario";

export const CATEGORIAS_CAJA: Record<CategoriaMovimientoCaja, { tipo: TipoMovimientoCaja; nombre: string; gasto: boolean }> = {
  NOMINA: { tipo: "EGRESO", nombre: "Nómina", gasto: true },
  ARRIENDO: { tipo: "EGRESO", nombre: "Arriendo", gasto: true },
  SERVICIOS: { tipo: "EGRESO", nombre: "Servicios públicos", gasto: true },
  TRANSPORTE: { tipo: "EGRESO", nombre: "Transporte", gasto: true },
  INSUMOS: { tipo: "EGRESO", nombre: "Insumos y aseo", gasto: true },
  IMPUESTOS: { tipo: "EGRESO", nombre: "Impuestos", gasto: true },
  OTRO_EGRESO: { tipo: "EGRESO", nombre: "Otro egreso", gasto: true },
  RETIRO_DUENO: { tipo: "EGRESO", nombre: "Retiro del dueño", gasto: false },
  APORTE: { tipo: "INGRESO", nombre: "Aporte del dueño o socio", gasto: false },
  OTRO_INGRESO: { tipo: "INGRESO", nombre: "Otro ingreso", gasto: false },
};

/** Categorías que cuentan como gasto del negocio en la utilidad. */
export const CATEGORIAS_GASTO = (Object.keys(CATEGORIAS_CAJA) as CategoriaMovimientoCaja[]).filter(
  (c) => CATEGORIAS_CAJA[c].gasto,
);

export type EntradaMovimientoCaja = {
  categoria: CategoriaMovimientoCaja;
  valor: number;
  medio: MedioPago;
  /** Día en formato aaaa-mm-dd (hora de Bogotá). */
  fecha: string;
  pagadoA?: string | null;
  nota?: string | null;
  /** Si es en efectivo y de hoy: entra o sale de la caja abierta. */
  desdeCaja: boolean;
};

class ErrorMovimiento extends Error {}

const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime());

export async function registrarMovimientoCaja(
  ctx: Contexto,
  negocioId: string,
  entrada: EntradaMovimientoCaja,
): Promise<Resultado<{ id: string }>> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const categoria = CATEGORIAS_CAJA[entrada.categoria];
  if (!categoria) return { ok: false, error: "Elige una categoría.", campos: { categoria: "Elige una." } };
  if (!Number.isInteger(entrada.valor) || entrada.valor <= 0) {
    return { ok: false, error: "Escribe el valor.", campos: { valor: "Debe ser mayor que cero." } };
  }
  if (entrada.valor > 2_000_000_000) return { ok: false, error: "Revisa el valor.", campos: { valor: "Es demasiado grande." } };
  if (!esDia(entrada.fecha)) return { ok: false, error: "Revisa la fecha.", campos: { fecha: "Fecha no válida." } };
  const hoy = diaEnBogota();
  if (entrada.fecha > hoy)
    return { ok: false, error: "La fecha no puede ser futura.", campos: { fecha: "Es una fecha futura." } };

  try {
    return await prisma.$transaction(async (tx) => {
      let cajaId: string | null = null;
      // Solo lo de hoy puede tocar la caja: la de otro día ya se contó.
      if (entrada.medio === "EFECTIVO" && entrada.desdeCaja && entrada.fecha === hoy) {
        const caja = await cajaAbiertaDeHoy(tx, ctx, negocioId);
        if (!caja) {
          throw new ErrorMovimiento(
            `La caja de hoy no está abierta. Ábrela o desmarca "${categoria.tipo === "EGRESO" ? "Sale de la caja" : "Entra a la caja"}".`,
          );
        }
        cajaId = caja.id;
      }
      const m = await tx.movimientoCaja.create({
        data: {
          empresaId: ctx.empresaId,
          negocioId,
          tipo: categoria.tipo,
          categoria: entrada.categoria,
          fecha: new Date(`${entrada.fecha}T00:00:00.000Z`),
          valor: entrada.valor,
          medio: entrada.medio,
          pagadoA: entrada.pagadoA?.trim().slice(0, 80) || null,
          nota: entrada.nota?.trim().slice(0, 300) || null,
          cajaId,
          usuarioId: ctx.usuarioId,
        },
        select: { id: true },
      });
      return { ok: true as const, id: m.id };
    });
  } catch (error) {
    if (error instanceof ErrorMovimiento) return { ok: false, error: error.message };
    throw error;
  }
}

export async function anularMovimientoCaja(ctx: Contexto, id: string, motivo: string): Promise<Resultado> {
  exigirGestion(ctx);
  const razon = motivo.trim().slice(0, 300);
  if (razon.length < 3) return { ok: false, error: "Escribe el motivo.", campos: { motivo: "Cuéntanos por qué se anula." } };
  const m = await datosDe(ctx).movimientoCaja.findFirst({
    where: { id },
    select: { id: true, negocioId: true, anulado: true, cajaId: true, valor: true, categoria: true },
  });
  if (!m) return { ok: false, error: "No encontramos ese registro." };
  if (m.anulado) return { ok: false, error: "Ese registro ya está anulado." };
  try {
    return await prisma.$transaction(async (tx) => {
      if (m.cajaId) {
        const caja = await tx.$queryRaw<{ estado: string }[]>`SELECT "estado" FROM "Caja" WHERE "id" = ${m.cajaId} FOR SHARE`;
        if (caja[0]?.estado === "CERRADA") {
          throw new ErrorMovimiento("Ese registro pasó por una caja que ya se cerró. Vuelve a abrir esa caja para anularlo.");
        }
      }
      const r = await tx.movimientoCaja.updateMany({
        where: { id: m.id, anulado: false },
        data: { anulado: true, anuladoEn: new Date(), anuladoPorId: ctx.usuarioId, motivoAnulacion: razon },
      });
      if (!r.count) throw new ErrorMovimiento("Ese registro ya está anulado.");
      await registrarAuditoria(tx, ctx, {
        negocioId: m.negocioId,
        accion: "ANULACION_MOVIMIENTO_CAJA",
        entidad: "MovimientoCaja",
        entidadId: m.id,
        detalle: { categoria: m.categoria, valor: m.valor, motivo: razon },
      });
      return { ok: true as const, id: m.id };
    });
  } catch (error) {
    if (error instanceof ErrorMovimiento) return { ok: false, error: error.message };
    throw error;
  }
}

export type MovimientoCajaVista = {
  id: string;
  negocioId: string;
  tipo: TipoMovimientoCaja;
  categoria: CategoriaMovimientoCaja;
  fecha: Date;
  valor: number;
  medio: MedioPago;
  pagadoA: string | null;
  nota: string | null;
  desdeCaja: boolean;
  usuario: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  creadoEn: Date;
};

/** Ingresos y egresos de uno o varios negocios entre dos días (incluidos), el más reciente arriba. */
export async function listarMovimientosCaja(
  ctx: Contexto,
  negocioIds: string[],
  desde: string,
  hasta: string,
): Promise<MovimientoCajaVista[]> {
  exigirGestion(ctx);
  for (const id of negocioIds) exigirNegocioPermitido(ctx, id);
  const datos = datosDe(ctx);
  const filas = await datos.movimientoCaja.findMany({
    where: {
      negocioId: { in: negocioIds },
      fecha: { gte: new Date(`${desde}T00:00:00.000Z`), lte: new Date(`${hasta}T00:00:00.000Z`) },
    },
    orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    take: 1000,
    select: {
      id: true,
      negocioId: true,
      tipo: true,
      categoria: true,
      fecha: true,
      valor: true,
      medio: true,
      pagadoA: true,
      nota: true,
      cajaId: true,
      usuarioId: true,
      anulado: true,
      motivoAnulacion: true,
      creadoEn: true,
    },
  });
  const usuarios = await datos.usuario.findMany({
    where: { id: { in: [...new Set(filas.map((f) => f.usuarioId))] } },
    select: { id: true, nombre: true },
  });
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return filas.map(({ cajaId, usuarioId, ...f }) => ({ ...f, desdeCaja: !!cajaId, usuario: nombre.get(usuarioId) ?? "" }));
}
