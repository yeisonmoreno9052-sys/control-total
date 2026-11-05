// Ventas a crédito (fiado) y abonos de los clientes.
//
// La deuda de un cliente no se guarda en un campo: se calcula siempre así:
//   lo fiado (ventas a crédito que no están anuladas)
//   − lo devuelto de esas ventas
//   − los abonos que no están anulados.
// Así nunca se descuadra: anular una venta fiada o hacerle una devolución
// baja la deuda sola, sin tocar la caja.
import { z } from "zod";
import type { MedioPago } from "@/generated/prisma/enums";
import { formatearPesos } from "@/lib/formato";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { cajaAbiertaDeHoy } from "./caja";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado, type Tx } from "./inventario";

class ErrorCredito extends Error {}

function comoResultado(error: unknown): { ok: false; error: string } {
  if (error instanceof ErrorCredito) return { ok: false, error: error.message };
  throw error;
}

/** Si el negocio tiene activadas las ventas a crédito. */
export async function negocioPermiteCredito(ctx: Contexto, negocioId: string) {
  const n = await datosDe(ctx).negocio.findFirst({ where: { id: negocioId }, select: { permiteCredito: true } });
  return n?.permiteCredito ?? false;
}

async function exigirCredito(ctx: Contexto, negocioId: string) {
  exigirNegocioPermitido(ctx, negocioId);
  if (!(await negocioPermiteCredito(ctx, negocioId))) {
    throw new ErrorCredito("Este negocio no tiene activadas las ventas a crédito.");
  }
}

type Cuentas = { fiado: number; devuelto: number; abonado: number };

/** Lo fiado, devuelto y abonado de los clientes de un negocio (o de uno solo). */
async function cuentasPorCliente(db: Tx, ctx: Contexto, negocioId: string, clienteId?: string) {
  const filtroCliente = clienteId ?? null;
  const [fiado, devuelto, abonado] = await Promise.all([
    db.$queryRaw<{ clienteId: string; total: bigint }[]>`
      SELECT v."clienteId", COALESCE(SUM(p."valor"), 0)::bigint AS total
      FROM "PagoVenta" p JOIN "Venta" v ON v."id" = p."ventaId"
      WHERE p."empresaId" = ${ctx.empresaId} AND p."negocioId" = ${negocioId} AND p."medio" = 'CREDITO'
        AND v."estado" <> 'ANULADA' AND v."clienteId" IS NOT NULL
        AND (${filtroCliente}::text IS NULL OR v."clienteId" = ${filtroCliente})
      GROUP BY v."clienteId"`,
    db.$queryRaw<{ clienteId: string; total: bigint }[]>`
      SELECT v."clienteId", COALESCE(SUM(d."total"), 0)::bigint AS total
      FROM "Devolucion" d JOIN "Venta" v ON v."id" = d."ventaId"
      WHERE d."empresaId" = ${ctx.empresaId} AND d."negocioId" = ${negocioId} AND d."medio" = 'CREDITO'
        AND v."estado" <> 'ANULADA' AND v."clienteId" IS NOT NULL
        AND (${filtroCliente}::text IS NULL OR v."clienteId" = ${filtroCliente})
      GROUP BY v."clienteId"`,
    db.$queryRaw<{ clienteId: string; total: bigint }[]>`
      SELECT "clienteId", COALESCE(SUM("valor"), 0)::bigint AS total
      FROM "AbonoCredito"
      WHERE "empresaId" = ${ctx.empresaId} AND "negocioId" = ${negocioId} AND NOT "anulado"
        AND (${filtroCliente}::text IS NULL OR "clienteId" = ${filtroCliente})
      GROUP BY "clienteId"`,
  ]);
  const cuentas = new Map<string, Cuentas>();
  const de = (id: string) => {
    let c = cuentas.get(id);
    if (!c) cuentas.set(id, (c = { fiado: 0, devuelto: 0, abonado: 0 }));
    return c;
  };
  for (const f of fiado) de(f.clienteId).fiado = Number(f.total);
  for (const f of devuelto) de(f.clienteId).devuelto = Number(f.total);
  for (const f of abonado) de(f.clienteId).abonado = Number(f.total);
  return cuentas;
}

const saldo = (c: Cuentas | undefined) => (c ? c.fiado - c.devuelto - c.abonado : 0);

/** Lo que debe hoy un cliente. Negativo = tiene saldo a favor. */
export async function saldoDeCliente(ctx: Contexto, negocioId: string, clienteId: string, db: Tx = prisma) {
  const cuentas = await cuentasPorCliente(db, ctx, negocioId, clienteId);
  return saldo(cuentas.get(clienteId));
}

export type DeudorVista = {
  id: string;
  nombre: string;
  telefono: string | null;
  debe: number;
  fiado: number;
  abonado: number;
};

/** Clientes que deben (o tienen saldo a favor), de mayor a menor deuda. */
export async function listarDeudores(ctx: Contexto, negocioId: string, q = ""): Promise<{ deudores: DeudorVista[]; totalDebe: number }> {
  exigirNegocioPermitido(ctx, negocioId);
  const cuentas = await cuentasPorCliente(prisma, ctx, negocioId);
  const ids = [...cuentas.entries()].filter(([, c]) => saldo(c) !== 0).map(([id]) => id);
  const texto = q.trim();
  const clientes = ids.length
    ? await datosDe(ctx).cliente.findMany({
        where: {
          id: { in: ids },
          negocioId,
          ...(texto
            ? { AND: texto.split(/\s+/).map((p) => ({ nombre: { contains: p, mode: "insensitive" as const } })) }
            : {}),
        },
        select: { id: true, nombre: true, telefono: true },
      })
    : [];
  const deudores = clientes
    .map((c) => {
      const k = cuentas.get(c.id)!;
      return { ...c, debe: saldo(k), fiado: k.fiado - k.devuelto, abonado: k.abonado };
    })
    .sort((a, b) => b.debe - a.debe || a.nombre.localeCompare(b.nombre, "es"));
  return { deudores, totalDebe: deudores.reduce((a, d) => a + Math.max(d.debe, 0), 0) };
}

export type MovimientoCredito = {
  id: string;
  tipo: "venta" | "devolucion" | "abono";
  fecha: Date;
  /** Positivo sube la deuda; negativo la baja. */
  valor: number;
  texto: string;
  ventaId?: string;
  anulado?: boolean;
  medio?: MedioPago;
  /** Abono que todavía se puede anular (su caja sigue abierta). */
  anulable?: boolean;
};

/** Cuenta de un cliente: lo que debe y todo lo que se le fió y abonó. */
export async function cuentaDeCliente(ctx: Contexto, negocioId: string, clienteId: string) {
  exigirNegocioPermitido(ctx, negocioId);
  const datos = datosDe(ctx);
  const cliente = await datos.cliente.findFirst({
    where: { id: clienteId, negocioId },
    select: { id: true, nombre: true, telefono: true, numeroDocumento: true },
  });
  if (!cliente) return null;

  const [pagos, abonos, cuentas] = await Promise.all([
    datos.pagoVenta.findMany({
      where: { negocioId, medio: "CREDITO", venta: { clienteId } },
      select: { ventaId: true, valor: true },
    }),
    datos.abonoCredito.findMany({
      where: { negocioId, clienteId },
      select: { id: true, valor: true, medio: true, creadoEn: true, anulado: true, nota: true, cajaId: true },
      orderBy: { creadoEn: "desc" },
      take: 300,
    }),
    cuentasPorCliente(prisma, ctx, negocioId, clienteId),
  ]);
  const ventaIds = pagos.map((p) => p.ventaId);
  const [ventas, devoluciones, cajasAbiertas] = await Promise.all([
    datos.venta.findMany({
      where: { id: { in: ventaIds } },
      select: { id: true, consecutivo: true, creadoEn: true, estado: true },
    }),
    datos.devolucion.findMany({
      where: { ventaId: { in: ventaIds }, medio: "CREDITO" },
      select: { id: true, ventaId: true, consecutivo: true, creadoEn: true, total: true },
    }),
    datos.caja.findMany({
      where: { negocioId, estado: "ABIERTA", id: { in: abonos.map((a) => a.cajaId).filter((x): x is string => !!x) } },
      select: { id: true },
    }),
  ]);
  const valorVenta = new Map(pagos.map((p) => [p.ventaId, p.valor]));
  const numeroVenta = new Map(ventas.map((v) => [v.id, v.consecutivo]));
  const abiertas = new Set(cajasAbiertas.map((c) => c.id));
  const movimientos: MovimientoCredito[] = [
    ...ventas.map((v) => ({
      id: v.id,
      tipo: "venta" as const,
      fecha: v.creadoEn,
      valor: valorVenta.get(v.id) ?? 0,
      texto: `Venta Nº ${String(v.consecutivo).padStart(6, "0")}`,
      ventaId: v.id,
      anulado: v.estado === "ANULADA",
    })),
    ...devoluciones.map((d) => ({
      id: d.id,
      tipo: "devolucion" as const,
      fecha: d.creadoEn,
      valor: -d.total,
      texto: `Devolución de la venta Nº ${String(numeroVenta.get(d.ventaId) ?? 0).padStart(6, "0")}`,
      ventaId: d.ventaId,
    })),
    ...abonos.map((a) => ({
      id: a.id,
      tipo: "abono" as const,
      fecha: a.creadoEn,
      valor: -a.valor,
      texto: a.nota ? `Abono · ${a.nota}` : "Abono",
      medio: a.medio,
      anulado: a.anulado,
      anulable: !a.anulado && (a.cajaId ? abiertas.has(a.cajaId) : true),
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  return { cliente, debe: saldo(cuentas.get(clienteId)), movimientos };
}

// ─── Abonos ─────────────────────────────────────────────────────────────────

export const esquemaAbono = z.object({
  valor: z.number().int("Escribe el valor sin decimales.").min(1, "Escribe cuánto abona."),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA"]),
  referencia: z.string().trim().max(100).nullable().optional(),
  nota: z.string().trim().max(200).nullable().optional(),
});

/**
 * Registra un abono. Si es en efectivo, entra a la caja de hoy (que debe estar
 * abierta) para que el cierre cuadre. No se puede abonar más de lo que se debe.
 */
export async function registrarAbono(
  ctx: Contexto,
  negocioId: string,
  clienteId: string,
  entrada: unknown,
): Promise<Resultado<{ id: string; debe: number }>> {
  const datos = esquemaAbono.safeParse(entrada);
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? "Revisa el abono." };
  try {
    await exigirCredito(ctx, negocioId);
    const cliente = await datosDe(ctx).cliente.findFirst({ where: { id: clienteId, negocioId }, select: { id: true, nombre: true } });
    if (!cliente) return { ok: false, error: "No encontramos ese cliente en este negocio." };
    const { valor, medio } = datos.data;

    return await prisma.$transaction(async (tx) => {
      // Bloquea al cliente para que dos abonos al mismo tiempo no pasen de lo que debe.
      await tx.$queryRaw`SELECT "id" FROM "Cliente" WHERE "id" = ${cliente.id} AND "empresaId" = ${ctx.empresaId} FOR UPDATE`;
      const debe = await saldoDeCliente(ctx, negocioId, cliente.id, tx);
      if (debe <= 0) throw new ErrorCredito(`${cliente.nombre} no debe nada.`);
      if (valor > debe) throw new ErrorCredito(`${cliente.nombre} solo debe ${formatearPesos(debe)}.`);

      const caja = await cajaAbiertaDeHoy(tx, ctx, negocioId);
      if (medio === "EFECTIVO" && !caja) throw new ErrorCredito("Abre la caja de hoy para recibir abonos en efectivo.");

      const abono = await tx.abonoCredito.create({
        data: {
          empresaId: ctx.empresaId,
          negocioId,
          clienteId: cliente.id,
          usuarioId: ctx.usuarioId,
          valor,
          medio,
          referencia: medio === "TRANSFERENCIA" ? datos.data.referencia || null : null,
          nota: datos.data.nota || null,
          cajaId: caja?.id ?? null,
        },
        select: { id: true },
      });
      await registrarAuditoria(tx, ctx, {
        negocioId,
        accion: "ABONO_CREDITO",
        entidad: "Cliente",
        entidadId: cliente.id,
        detalle: { cliente: cliente.nombre, valor, medio, debiaAntes: debe },
      });
      return { ok: true as const, id: abono.id, debe: debe - valor };
    });
  } catch (error) {
    return comoResultado(error);
  }
}

/**
 * Anula un abono mal registrado. Solo administrador o socio, y solo mientras
 * la caja donde entró siga abierta (si ya se cerró, esa plata ya se contó).
 */
export async function anularAbono(ctx: Contexto, abonoId: string, motivo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  exigirGestion(ctx);
  const razon = motivo.trim();
  if (razon.length < 3) return { ok: false, error: "Escribe por qué se anula el abono." };
  const abono = await datosDe(ctx).abonoCredito.findFirst({
    where: { id: abonoId },
    select: { id: true, negocioId: true, clienteId: true, valor: true, cajaId: true, anulado: true },
  });
  if (!abono) return { ok: false, error: "No encontramos ese abono." };
  if (abono.anulado) return { ok: false, error: "Ese abono ya está anulado." };
  try {
    return await prisma.$transaction(async (tx) => {
      if (abono.cajaId) {
        const caja = await tx.caja.findFirst({ where: { id: abono.cajaId, empresaId: ctx.empresaId }, select: { estado: true } });
        if (caja?.estado !== "ABIERTA") throw new ErrorCredito("La caja de ese día ya se cerró: el abono no se puede anular.");
      }
      const cambiados = await tx.abonoCredito.updateMany({
        where: { id: abono.id, empresaId: ctx.empresaId, anulado: false },
        data: { anulado: true, anuladoEn: new Date(), anuladoPorId: ctx.usuarioId },
      });
      if (!cambiados.count) throw new ErrorCredito("Ese abono ya está anulado.");
      const cliente = await tx.cliente.findFirst({ where: { id: abono.clienteId, empresaId: ctx.empresaId }, select: { nombre: true } });
      await registrarAuditoria(tx, ctx, {
        negocioId: abono.negocioId,
        accion: "ANULACION_ABONO_CREDITO",
        entidad: "Cliente",
        entidadId: abono.clienteId,
        detalle: { cliente: cliente?.nombre ?? "", valor: abono.valor, motivo: razon.slice(0, 300) },
      });
      return { ok: true as const };
    });
  } catch (error) {
    return comoResultado(error);
  }
}
