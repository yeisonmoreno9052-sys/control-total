// Ventas hechas sin internet: el computador de la caja las guarda y las sube cuando
// vuelve la conexión. Aquí se reciben.
//
// Diferencias con una venta normal (registrarVenta):
// - Se respeta el precio que se cobró, aunque haya cambiado en el sistema: el cliente ya pagó.
//   La venta queda marcada "sin conexión" y, si el precio no coincide, queda en la auditoría.
// - El stock puede quedar en negativo (otro computador pudo vender lo mismo durante el corte).
// - Fecha y hora son las del momento real de la venta; el número definitivo se asigna al subir.
// - Subirla dos veces no la duplica: cada venta trae un código único (idLocal).
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { diaEnBogota, formatearDia, formatearPesos } from "@/lib/formato";
import { Decimal, formatearCantidad, leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "@/lib/inventario/cantidades";
import { puedeGestionar } from "@/lib/permisos";
import { calcularPago, calcularTotales, ErrorTotales, type Descuento, type FormaPago } from "@/lib/ventas/totales";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, registrarMovimiento, type Tx } from "./inventario";
import { bloquearProductos, siguienteConsecutivo } from "./ventas";

export type LineaSinConexion = {
  productoId: string;
  cantidad: string;
  /** Precio con el que se cobró (el de la copia de productos del computador). */
  precioUnitario: number;
  porcentajeIva: number;
  descuento?: Descuento | null;
};

export type VentaSinConexion = {
  idLocal: string;
  numeroProvisional: string;
  /** Momento real de la venta (ISO). */
  creadaEn: string;
  /** Quien vendió. Si no es quien sube la venta, solo lo acepta un administrador o socio. */
  vendedorId?: string | null;
  lineas: LineaSinConexion[];
  descuentoGeneral?: Descuento | null;
  pago: FormaPago;
  clienteId?: string | null;
  total: number;
};

/**
 * ok: subió (o ya estaba). reintentar: un problema que se arregla solo o abriendo la caja;
 * la venta sigue guardada en el computador. Si no, la venta tiene un error que hay que revisar.
 */
export type ResultadoSubida =
  | { ok: true; id: string; consecutivo: number; nota: string | null; yaExistia: boolean }
  | { ok: false; error: string; reintentar: boolean };

class ErrorSubida extends Error {
  constructor(
    mensaje: string,
    readonly reintentar = false,
  ) {
    super(mensaje);
    this.name = "ErrorSubida";
  }
}

const MAXIMO_ATRASO = 45 * 24 * 60 * 60 * 1000;
const MAXIMO_ADELANTO = 15 * 60 * 1000;

async function existente(negocioId: string, idLocal: string) {
  return prisma.venta.findUnique({
    where: { negocioId_idLocal: { negocioId, idLocal } },
    select: { id: true, consecutivo: true, notaSincronizacion: true, empresaId: true },
  });
}

/**
 * Caja a la que entra la venta: la del día en que se hizo si sigue abierta; si no, la caja
 * abierta más reciente; si no hay ninguna, se abre la de hoy con base $ 0. Queda bloqueada
 * (FOR SHARE) hasta el final, como en una venta normal.
 */
async function cajaParaVenta(tx: Tx, ctx: Contexto, negocioId: string, diaVenta: string) {
  const delDia = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Caja"
    WHERE "negocioId" = ${negocioId} AND "fecha" = ${diaVenta}::date AND "estado" = 'ABIERTA'
    FOR SHARE`;
  if (delDia[0]) return { id: delDia[0].id, nota: null };

  const motivo = (await tx.caja.findFirst({ where: { negocioId, fecha: new Date(`${diaVenta}T00:00:00.000Z`) }, select: { id: true } }))
    ? `La caja del ${formatearDia(new Date(`${diaVenta}T00:00:00.000Z`))} ya estaba cerrada`
    : `El ${formatearDia(new Date(`${diaVenta}T00:00:00.000Z`))} no se abrió caja`;

  const abierta = await tx.$queryRaw<{ id: string; fecha: Date }[]>`
    SELECT "id", "fecha" FROM "Caja"
    WHERE "negocioId" = ${negocioId} AND "estado" = 'ABIERTA'
    ORDER BY "fecha" DESC LIMIT 1
    FOR SHARE`;
  if (abierta[0]) {
    return { id: abierta[0].id, nota: `${motivo}: entró en la caja del ${formatearDia(abierta[0].fecha)}.` };
  }

  const hoy = diaEnBogota();
  // ON CONFLICT: si otra venta abrió la caja de hoy al mismo tiempo, se usa esa.
  await tx.$executeRaw`
    INSERT INTO "Caja" ("id", "empresaId", "negocioId", "fecha", "estado", "base", "abiertaPorId")
    VALUES (${randomUUID()}, ${ctx.empresaId}, ${negocioId}, ${hoy}::date, 'ABIERTA', 0, ${ctx.usuarioId})
    ON CONFLICT ("negocioId", "fecha") DO NOTHING`;
  const deHoy = await tx.$queryRaw<{ id: string; estado: string }[]>`
    SELECT "id", "estado" FROM "Caja" WHERE "negocioId" = ${negocioId} AND "fecha" = ${hoy}::date FOR SHARE`;
  if (!deHoy[0] || deHoy[0].estado !== "ABIERTA") {
    throw new ErrorSubida(
      "La caja de hoy ya se cerró. Vuelve a abrirla para subir las ventas hechas sin internet.",
      true,
    );
  }
  return { id: deHoy[0].id, nota: `${motivo}: se abrió sola la caja de hoy con base $ 0.` };
}

export async function subirVentaSinConexion(
  ctx: Contexto,
  negocioId: string,
  entrada: VentaSinConexion,
): Promise<ResultadoSubida> {
  exigirNegocioPermitido(ctx, negocioId);
  const idLocal = entrada.idLocal.trim();
  if (!/^[\w-]{8,60}$/.test(idLocal)) return { ok: false, error: "La venta guardada está dañada.", reintentar: false };

  const ya = await existente(negocioId, idLocal);
  if (ya && ya.empresaId === ctx.empresaId) {
    return { ok: true, id: ya.id, consecutivo: ya.consecutivo, nota: ya.notaSincronizacion, yaExistia: true };
  }

  const creadaEn = new Date(entrada.creadaEn);
  const ahora = Date.now();
  if (Number.isNaN(creadaEn.getTime()) || creadaEn.getTime() > ahora + MAXIMO_ADELANTO) {
    return { ok: false, error: "La fecha de la venta no es válida. Revisa la fecha y hora del computador.", reintentar: false };
  }
  if (creadaEn.getTime() < ahora - MAXIMO_ATRASO) {
    return { ok: false, error: "La venta tiene más de 45 días. Pídele al administrador que la registre a mano.", reintentar: false };
  }
  if (!entrada.lineas.length || entrada.lineas.length > 300) {
    return { ok: false, error: "La venta guardada no tiene productos válidos.", reintentar: false };
  }

  let vendedorId = ctx.usuarioId;
  if (entrada.vendedorId && entrada.vendedorId !== ctx.usuarioId) {
    if (!puedeGestionar(ctx)) {
      return { ok: false, error: "Esta venta la hizo otra persona: debe subirla ella o un administrador.", reintentar: true };
    }
    const vendedor = await datosDe(ctx).usuario.findFirst({ where: { id: entrada.vendedorId }, select: { id: true } });
    if (!vendedor) return { ok: false, error: "No encontramos a quien hizo esta venta.", reintentar: false };
    vendedorId = vendedor.id;
  }

  const notas: string[] = [];
  let clienteId: string | null = null;
  if (entrada.clienteId) {
    const cliente = await datosDe(ctx).cliente.findFirst({ where: { id: entrada.clienteId, negocioId }, select: { id: true } });
    if (cliente) clienteId = cliente.id;
    else notas.push("El cliente ya no existe; quedó sin cliente.");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // La caja se elige antes que los productos, igual que en una venta normal (mismo orden de bloqueos).
        const caja = await cajaParaVenta(tx, ctx, negocioId, diaEnBogota(creadaEn));
        if (caja.nota) notas.push(caja.nota);

        const productos = await bloquearProductos(tx, [...new Set(entrada.lineas.map((l) => l.productoId))]);
        const pedido = new Map<string, Decimal>();
        const preciosDistintos: { producto: string; cobrado: number; actual: number }[] = [];
        const lineas = entrada.lineas.map((l) => {
          const p = productos.get(l.productoId);
          if (!p || p.empresaId !== ctx.empresaId || p.negocioId !== negocioId) {
            throw new ErrorSubida("Uno de los productos no existe en este negocio.");
          }
          const cantidad = leerCantidad(l.cantidad);
          const problema = validarCantidad(cantidad, { fraccionado: p.fraccionado });
          if (problema || !cantidad || cantidad.isZero()) {
            throw new ErrorSubida(`${p.nombre}: ${MENSAJES_CANTIDAD[problema ?? "invalida"]}`);
          }
          if (!Number.isInteger(l.precioUnitario) || l.precioUnitario < 0 || ![0, 5, 19].includes(l.porcentajeIva)) {
            throw new ErrorSubida(`${p.nombre}: el precio guardado no es válido.`);
          }
          if (l.precioUnitario !== p.precioVenta) {
            preciosDistintos.push({ producto: p.nombre, cobrado: l.precioUnitario, actual: p.precioVenta });
          }
          pedido.set(p.id, (pedido.get(p.id) ?? new Decimal(0)).plus(cantidad));
          return { producto: p, cantidad, precio: l.precioUnitario, iva: l.porcentajeIva, descuento: l.descuento ?? null };
        });

        const totales = calcularTotales(
          lineas.map((l) => ({ precioUnitario: l.precio, cantidad: l.cantidad, porcentajeIva: l.iva, descuento: l.descuento })),
          entrada.descuentoGeneral,
        );
        if (totales.total !== entrada.total) throw new ErrorSubida("El total guardado no coincide con los productos.");
        const pago = calcularPago(totales.total, entrada.pago);

        const consecutivo = await siguienteConsecutivo(tx, negocioId, "consecutivoVenta");
        const venta = await tx.venta.create({
          data: {
            empresaId: ctx.empresaId,
            negocioId,
            cajaId: caja.id,
            usuarioId: vendedorId,
            clienteId,
            consecutivo,
            subtotal: totales.subtotal,
            descuento: totales.descuento,
            base: totales.base,
            iva: totales.iva,
            total: totales.total,
            recibido: pago.recibido,
            cambio: pago.cambio,
            creadoEn: creadaEn,
            idLocal,
            numeroProvisional: entrada.numeroProvisional.slice(0, 20),
            sinConexion: true,
            sincronizadaEn: new Date(),
          },
          select: { id: true },
        });
        await tx.detalleVenta.createMany({
          data: lineas.map((l, i) => {
            const t = totales.lineas[i];
            return {
              empresaId: ctx.empresaId,
              negocioId,
              ventaId: venta.id,
              productoId: l.producto.id,
              codigo: l.producto.codigo,
              nombre: l.producto.nombre,
              unidad: l.producto.unidad as never,
              cantidad: l.cantidad.toString(),
              precioUnitario: l.precio,
              costoUnitario: l.producto.costo,
              porcentajeIva: l.iva,
              subtotal: t.subtotal,
              descuento: t.descuento,
              base: t.base,
              iva: t.iva,
              total: t.total,
            };
          }),
        });
        await tx.pagoVenta.createMany({
          data: pago.pagos.map((p) => ({ empresaId: ctx.empresaId, negocioId, ventaId: venta.id, ...p })),
        });

        const negativos: string[] = [];
        for (const [productoId, cantidad] of [...pedido].sort(([a], [b]) => (a < b ? -1 : 1))) {
          const { despues } = await registrarMovimiento(tx, ctx, {
            productoId,
            tipo: "VENTA",
            cantidad: cantidad.negated(),
            nota: `Venta Nº ${consecutivo} (sin conexión, ${entrada.numeroProvisional})`,
            permitirNegativo: true,
          });
          if (despues.isNegative()) negativos.push(`${productos.get(productoId)!.nombre} (${formatearCantidad(despues)})`);
        }
        if (negativos.length) notas.push(`Quedaron en negativo: ${negativos.join(", ")}.`);
        if (preciosDistintos.length) {
          notas.push(
            `Se cobró con otro precio: ${preciosDistintos.map((d) => `${d.producto} a ${formatearPesos(d.cobrado)} (hoy ${formatearPesos(d.actual)})`).join(", ")}.`,
          );
        }

        const nota = notas.join(" ") || null;
        if (nota) await tx.venta.update({ where: { id: venta.id }, data: { notaSincronizacion: nota.slice(0, 1000) } });
        await registrarAuditoria(tx, ctx, {
          negocioId,
          accion: "VENTA_SIN_CONEXION",
          entidad: "Venta",
          entidadId: venta.id,
          detalle: { consecutivo, provisional: entrada.numeroProvisional, creadaEn: creadaEn.toISOString(), preciosDistintos, negativos },
        });
        return { ok: true as const, id: venta.id, consecutivo, nota, yaExistia: false };
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    if (error instanceof ErrorSubida) return { ok: false, error: error.message, reintentar: error.reintentar };
    if (error instanceof ErrorTotales) return { ok: false, error: error.message, reintentar: false };
    // Dos subidas de la misma venta al mismo tiempo: la segunda choca con el código único y devuelve la primera.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const otra = await existente(negocioId, idLocal);
      if (otra && otra.empresaId === ctx.empresaId) {
        return { ok: true, id: otra.id, consecutivo: otra.consecutivo, nota: otra.notaSincronizacion, yaExistia: true };
      }
    }
    throw error;
  }
}
