// Caja del día: se abre con una base y se cierra contando el efectivo.
//
// Efectivo esperado al cerrar =
//     base
//   + efectivo de las ventas hechas en esta caja
//   − efectivo de las ventas anuladas mientras esta caja estaba abierta
//   − devoluciones pagadas en efectivo desde esta caja
//   − pagos a proveedores en efectivo que salieron de esta caja
//   + ingresos en efectivo − egresos en efectivo (nómina, arriendo, retiros…) de esta caja
import { diaEnBogota, fechaDeHoy } from "@/lib/formato";
import { exigirGestion, puedeGestionar } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado, type Tx } from "./inventario";

export type CajaVista = {
  id: string;
  fecha: Date;
  estado: "ABIERTA" | "CERRADA";
  base: number;
  abiertaEn: Date;
  cerradaEn: Date | null;
};

const CAMPOS = { id: true, fecha: true, estado: true, base: true, abiertaEn: true, cerradaEn: true } as const;

/** La caja de hoy del negocio (abierta o cerrada) y, si quedó alguna abierta de otro día, esa. */
export async function estadoDeCaja(ctx: Contexto, negocioId: string) {
  exigirNegocioPermitido(ctx, negocioId);
  const datos = datosDe(ctx);
  const hoy = fechaDeHoy();
  const [deHoy, pendiente] = await Promise.all([
    datos.caja.findFirst({ where: { negocioId, fecha: hoy }, select: CAMPOS }),
    datos.caja.findFirst({
      where: { negocioId, estado: "ABIERTA", fecha: { not: hoy } },
      select: CAMPOS,
      orderBy: { fecha: "asc" },
    }),
  ]);
  return { hoy: deHoy as CajaVista | null, pendiente: pendiente as CajaVista | null };
}

/**
 * Caja abierta hoy en el negocio, dentro de una transacción. Null si no hay.
 * La deja bloqueada (FOR SHARE) hasta que termine la transacción: así nadie
 * la puede cerrar a mitad de una venta, y una venta no entra en una caja que
 * se acaba de cerrar.
 */
export async function cajaAbiertaDeHoy(tx: Tx, ctx: Contexto, negocioId: string) {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Caja"
    WHERE "empresaId" = ${ctx.empresaId} AND "negocioId" = ${negocioId}
      AND "fecha" = ${diaEnBogota()}::date AND "estado" = 'ABIERTA'
    FOR SHARE`;
  return filas[0] ?? null;
}

export async function abrirCaja(ctx: Contexto, negocioId: string, base: number): Promise<Resultado> {
  exigirNegocioPermitido(ctx, negocioId);
  if (!Number.isInteger(base) || base < 0) return { ok: false, error: "Escribe una base válida.", campos: { base: "Revisa el valor." } };

  const { hoy, pendiente } = await estadoDeCaja(ctx, negocioId);
  if (pendiente) {
    return { ok: false, error: "Hay una caja de otro día sin cerrar. Ciérrala antes de abrir la de hoy." };
  }
  if (hoy) {
    return {
      ok: false,
      error: hoy.estado === "ABIERTA" ? "La caja de hoy ya está abierta." : "La caja de hoy ya se cerró.",
    };
  }
  try {
    const caja = await prisma.caja.create({
      data: { empresaId: ctx.empresaId, negocioId, fecha: fechaDeHoy(), base, abiertaPorId: ctx.usuarioId },
      select: { id: true },
    });
    return { ok: true, id: caja.id };
  } catch {
    // Dos personas abriendo la caja al mismo tiempo: la segunda ve que ya está abierta.
    return { ok: false, error: "La caja de hoy ya está abierta." };
  }
}

export type ResumenCaja = {
  base: number;
  ventas: number;
  ventasEfectivo: number;
  ventasTransferencia: number;
  anulacionesEfectivo: number;
  devolucionesEfectivo: number;
  pagosProveedores: number;
  ingresosEfectivo: number;
  egresosEfectivo: number;
  esperado: number;
};

/** Cuentas de la caja. Se usa para cerrar y para que el administrador vea el cierre. */
export async function resumenDeCaja(db: Tx, ctx: Contexto, cajaId: string): Promise<ResumenCaja | null> {
  const caja = await db.caja.findFirst({
    where: { id: cajaId, empresaId: ctx.empresaId, negocioId: { in: ctx.negociosPermitidos } },
    select: { base: true },
  });
  if (!caja) return null;

  const [pagos, anulados, devoluciones, ventas, proveedores, movimientos] = await Promise.all([
    db.pagoVenta.groupBy({
      by: ["medio"],
      where: { empresaId: ctx.empresaId, venta: { cajaId } },
      _sum: { valor: true },
    }),
    db.pagoVenta.aggregate({
      where: { empresaId: ctx.empresaId, medio: "EFECTIVO", venta: { anuladaEnCajaId: cajaId } },
      _sum: { valor: true },
    }),
    db.devolucion.aggregate({
      where: { empresaId: ctx.empresaId, cajaId, medio: "EFECTIVO" },
      _sum: { total: true },
    }),
    db.venta.count({ where: { empresaId: ctx.empresaId, cajaId, estado: { not: "ANULADA" } } }),
    // Pagos a proveedores en efectivo que salieron de esta caja.
    db.abonoFactura.aggregate({
      where: { empresaId: ctx.empresaId, cajaId, medio: "EFECTIVO", anulado: false },
      _sum: { valor: true },
    }),
    db.movimientoCaja.groupBy({
      by: ["tipo"],
      where: { empresaId: ctx.empresaId, cajaId, medio: "EFECTIVO", anulado: false },
      _sum: { valor: true },
    }),
  ]);
  const porMedio = (medio: string) => pagos.find((p) => p.medio === medio)?._sum.valor ?? 0;
  const ventasEfectivo = porMedio("EFECTIVO");
  const anulacionesEfectivo = anulados._sum.valor ?? 0;
  const devolucionesEfectivo = devoluciones._sum.total ?? 0;
  const pagosProveedores = proveedores._sum.valor ?? 0;
  const porTipo = (tipo: string) => movimientos.find((m) => m.tipo === tipo)?._sum.valor ?? 0;
  const ingresosEfectivo = porTipo("INGRESO");
  const egresosEfectivo = porTipo("EGRESO");
  return {
    base: caja.base,
    ventas,
    ventasEfectivo,
    ventasTransferencia: porMedio("TRANSFERENCIA"),
    anulacionesEfectivo,
    devolucionesEfectivo,
    pagosProveedores,
    ingresosEfectivo,
    egresosEfectivo,
    esperado:
      caja.base +
      ventasEfectivo -
      anulacionesEfectivo -
      devolucionesEfectivo -
      pagosProveedores +
      ingresosEfectivo -
      egresosEfectivo,
  };
}

export async function verResumenDeCaja(ctx: Contexto, cajaId: string) {
  exigirGestion(ctx);
  return resumenDeCaja(prisma, ctx, cajaId);
}

/**
 * Cierra la caja con el efectivo contado. El cajero cierra "a ciegas":
 * la respuesta solo le trae la diferencia a quien puede gestionar.
 */
export async function cerrarCaja(
  ctx: Contexto,
  cajaId: string,
  contado: number,
  nota: string | null,
): Promise<Resultado<{ id: string; esperado: number | null; diferencia: number | null }>> {
  if (!Number.isInteger(contado) || contado < 0) {
    return { ok: false, error: "Escribe cuánto efectivo contaste.", campos: { contado: "Revisa el valor." } };
  }
  const caja = await datosDe(ctx).caja.findFirst({ where: { id: cajaId }, select: { id: true, negocioId: true, estado: true } });
  if (!caja) return { ok: false, error: "No encontramos esa caja." };
  if (caja.estado === "CERRADA") return { ok: false, error: "Esta caja ya está cerrada." };

  const resultado = await prisma.$transaction(async (tx) => {
    // Bloquea la caja: nadie vende ni anula en ella mientras se cierra.
    await tx.$queryRaw`SELECT "id" FROM "Caja" WHERE "id" = ${cajaId} FOR UPDATE`;
    const resumen = (await resumenDeCaja(tx, ctx, cajaId))!;
    const { count } = await tx.caja.updateMany({
      where: { id: cajaId, estado: "ABIERTA" },
      data: {
        estado: "CERRADA",
        cerradaPorId: ctx.usuarioId,
        cerradaEn: new Date(),
        esperado: resumen.esperado,
        contado,
        diferencia: contado - resumen.esperado,
        nota: nota?.trim() || null,
      },
    });
    return count ? resumen : null;
  });
  if (!resultado) return { ok: false, error: "Esta caja ya está cerrada." };

  const ver = puedeGestionar(ctx);
  return {
    ok: true,
    id: cajaId,
    esperado: ver ? resultado.esperado : null,
    diferencia: ver ? contado - resultado.esperado : null,
  };
}

/** Vuelve a abrir una caja cerrada (por ejemplo, para registrar una venta olvidada). */
export async function reabrirCaja(ctx: Contexto, cajaId: string): Promise<Resultado> {
  exigirGestion(ctx);
  const caja = await datosDe(ctx).caja.findFirst({
    where: { id: cajaId },
    select: { id: true, negocioId: true, estado: true, contado: true, esperado: true, fecha: true },
  });
  if (!caja) return { ok: false, error: "No encontramos esa caja." };
  if (caja.estado === "ABIERTA") return { ok: false, error: "Esta caja ya está abierta." };
  if (caja.fecha.getTime() !== fechaDeHoy().getTime()) {
    return { ok: false, error: "Solo se puede volver a abrir la caja de hoy." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.caja.update({
      where: { id: cajaId },
      data: { estado: "ABIERTA", cerradaPorId: null, cerradaEn: null, esperado: null, contado: null, diferencia: null },
    });
    await registrarAuditoria(tx, ctx, {
      negocioId: caja.negocioId,
      accion: "REABRIR_CAJA",
      entidad: "Caja",
      entidadId: cajaId,
      detalle: { contadoAntes: caja.contado, esperadoAntes: caja.esperado },
    });
  });
  return { ok: true, id: cajaId };
}

/**
 * Cajas del negocio, la más reciente primero (para el administrador).
 * Con fechas, solo las de esos días (días de Bogotá, ambos incluidos); sin fechas, las últimas 30.
 */
export async function listarCierres(ctx: Contexto, negocioId: string, fechas?: { desde: string; hasta: string }) {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const datos = datosDe(ctx);
  const cajas = await datos.caja.findMany({
    where: {
      negocioId,
      ...(fechas
        ? { fecha: { gte: new Date(`${fechas.desde}T00:00:00.000Z`), lte: new Date(`${fechas.hasta}T00:00:00.000Z`) } }
        : {}),
    },
    select: {
      id: true, fecha: true, estado: true, base: true, esperado: true, contado: true, diferencia: true,
      cerradaEn: true, cerradaPorId: true, nota: true,
    },
    orderBy: { fecha: "desc" },
    take: fechas ? 400 : 30,
  });
  const ids = [...new Set(cajas.map((c) => c.cerradaPorId).filter((x): x is string => !!x))];
  const usuarios = ids.length ? await datos.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } }) : [];
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  return cajas.map((c) => ({ ...c, cerradaPor: c.cerradaPorId ? (nombre.get(c.cerradaPorId) ?? null) : null }));
}

/** Todo lo de una caja para verla o imprimirla: cuentas, quién abrió y cerró, y el negocio. */
export async function detalleDeCierre(ctx: Contexto, cajaId: string) {
  exigirGestion(ctx);
  const datos = datosDe(ctx);
  const caja = await datos.caja.findFirst({
    where: { id: cajaId, negocioId: { in: ctx.negociosPermitidos } },
    select: {
      id: true, negocioId: true, fecha: true, estado: true, abiertaPorId: true, abiertaEn: true, cerradaPorId: true,
      cerradaEn: true, esperado: true, contado: true, diferencia: true, nota: true,
    },
  });
  if (!caja) return null;
  const ids = [caja.abiertaPorId, caja.cerradaPorId].filter((x): x is string => !!x);
  const [resumen, negocio, usuarios] = await Promise.all([
    resumenDeCaja(prisma, ctx, caja.id),
    datos.negocio.findFirst({ where: { id: caja.negocioId }, select: { nombre: true } }),
    datos.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } }),
  ]);
  const nombre = (id: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? null;
  return {
    ...caja,
    negocio: negocio?.nombre ?? "",
    abiertaPor: nombre(caja.abiertaPorId),
    cerradaPor: nombre(caja.cerradaPorId),
    resumen: resumen!,
  };
}
