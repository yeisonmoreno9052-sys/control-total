// Ventas: cobrar, anular y devolver.
//
// Una venta registrada nunca se edita ni se borra. Si hay un error se anula
// (queda la venta original y un rastro de quién, cuándo y por qué) o se hace
// una devolución, que es un documento aparte ligado a la venta.
import type { MedioPago } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { Decimal, MENSAJES_CANTIDAD, formatearCantidad, leerCantidad, validarCantidad } from "@/lib/inventario/cantidades";
import { fechaDeHoy } from "@/lib/formato";
import { puedeGestionar, puedeVerCostos } from "@/lib/permisos";
import {
  calcularPago,
  calcularTotales,
  ErrorTotales,
  separarIva,
  type Descuento,
  type FormaPago,
} from "@/lib/ventas/totales";
import { datosDe } from "./alcance";
import { cajaAbiertaDeHoy } from "./caja";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import {
  exigirNegocioPermitido,
  registrarAuditoria,
  registrarMovimiento,
  StockInsuficiente,
  type Resultado,
  type Tx,
} from "./inventario";

/** Error con un mensaje para la persona; cancela la transacción. */
class ErrorVenta extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorVenta";
  }
}

function comoResultado(error: unknown): { ok: false; error: string } {
  if (error instanceof ErrorVenta || error instanceof ErrorTotales) return { ok: false, error: error.message };
  if (error instanceof StockInsuficiente) return { ok: false, error: error.message };
  throw error;
}

const SIN_CAJA = "Abre la caja de hoy antes de cobrar.";

// ─── Cobrar ─────────────────────────────────────────────────────────────────

export type LineaVenta = { productoId: string; cantidad: string; descuento?: Descuento | null };

export type EntradaVenta = {
  lineas: LineaVenta[];
  descuentoGeneral?: Descuento | null;
  pago: FormaPago;
  clienteId?: string | null;
  /** Total que vio el cajero en pantalla. Si los precios cambiaron, no se cobra. */
  totalEsperado: number;
};

type ProductoBloqueado = {
  id: string;
  empresaId: string;
  negocioId: string;
  codigo: string;
  nombre: string;
  unidad: string;
  precioVenta: number;
  costo: number;
  porcentajeIva: number;
  fraccionado: boolean;
  activo: boolean;
  stock: { toString(): string };
};

/** Bloquea los productos en orden de id (así dos ventas nunca se esperan en círculo). */
async function bloquearProductos(tx: Tx, ids: string[]) {
  const filas = await tx.$queryRaw<ProductoBloqueado[]>`
    SELECT "id", "empresaId", "negocioId", "codigo", "nombre", "unidad", "precioVenta", "costo",
           "porcentajeIva", "fraccionado", "activo", "stock"
    FROM "Producto" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
  return new Map(filas.map((f) => [f.id, f]));
}

async function siguienteConsecutivo(tx: Tx, negocioId: string, campo: "consecutivoVenta" | "consecutivoDevolucion") {
  // El UPDATE bloquea la fila del negocio: dos cobros al mismo tiempo reciben números seguidos,
  // y si la venta falla el número se devuelve con el resto de la transacción (no quedan huecos).
  const filas =
    campo === "consecutivoVenta"
      ? await tx.$queryRaw<{ n: number }[]>`
          UPDATE "Negocio" SET "consecutivoVenta" = "consecutivoVenta" + 1 WHERE "id" = ${negocioId}
          RETURNING "consecutivoVenta" AS n`
      : await tx.$queryRaw<{ n: number }[]>`
          UPDATE "Negocio" SET "consecutivoDevolucion" = "consecutivoDevolucion" + 1 WHERE "id" = ${negocioId}
          RETURNING "consecutivoDevolucion" AS n`;
  return Number(filas[0].n);
}

export async function registrarVenta(
  ctx: Contexto,
  negocioId: string,
  entrada: EntradaVenta,
): Promise<Resultado<{ id: string; consecutivo: number; total: number; cambio: number | null }>> {
  exigirNegocioPermitido(ctx, negocioId);
  if (!entrada.lineas.length) return { ok: false, error: "Agrega al menos un producto." };
  if (entrada.lineas.length > 300) return { ok: false, error: "La venta tiene demasiados productos." };

  if (entrada.clienteId) {
    const cliente = await datosDe(ctx).cliente.findFirst({
      where: { id: entrada.clienteId, negocioId, activo: true },
      select: { id: true },
    });
    if (!cliente) return { ok: false, error: "No encontramos ese cliente en este negocio." };
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const caja = await cajaAbiertaDeHoy(tx, ctx, negocioId);
        if (!caja) throw new ErrorVenta(SIN_CAJA);

        const productos = await bloquearProductos(tx, [...new Set(entrada.lineas.map((l) => l.productoId))]);

        // Revisar cada línea y sumar lo pedido de cada producto (puede venir en dos líneas).
        const pedido = new Map<string, Decimal>();
        const lineas = entrada.lineas.map((l) => {
          const p = productos.get(l.productoId);
          if (!p || p.empresaId !== ctx.empresaId || p.negocioId !== negocioId) {
            throw new ErrorVenta("Uno de los productos no existe en este negocio.");
          }
          if (!p.activo) throw new ErrorVenta(`"${p.nombre}" está inactivo y no se puede vender.`);
          const cantidad = leerCantidad(l.cantidad);
          const error = validarCantidad(cantidad, { fraccionado: p.fraccionado });
          if (error || !cantidad || cantidad.isZero()) {
            throw new ErrorVenta(`${p.nombre}: ${MENSAJES_CANTIDAD[error ?? "invalida"]}`);
          }
          pedido.set(p.id, (pedido.get(p.id) ?? new Decimal(0)).plus(cantidad));
          return { producto: p, cantidad, descuento: l.descuento ?? null };
        });

        for (const [id, cantidad] of pedido) {
          const p = productos.get(id)!;
          const stock = new Decimal(p.stock.toString());
          if (cantidad.greaterThan(stock)) {
            throw new ErrorVenta(
              stock.lte(0)
                ? `No hay stock de "${p.nombre}".`
                : `No hay suficiente stock de "${p.nombre}": solo quedan ${formatearCantidad(stock)}.`,
            );
          }
        }

        const totales = calcularTotales(
          lineas.map((l) => ({
            precioUnitario: l.producto.precioVenta,
            cantidad: l.cantidad,
            porcentajeIva: l.producto.porcentajeIva,
            descuento: l.descuento,
          })),
          entrada.descuentoGeneral,
        );
        if (totales.total !== entrada.totalEsperado) {
          throw new ErrorVenta("Los precios cambiaron mientras armabas la venta. Revisa el total y vuelve a cobrar.");
        }
        const pago = calcularPago(totales.total, entrada.pago);

        const consecutivo = await siguienteConsecutivo(tx, negocioId, "consecutivoVenta");
        const venta = await tx.venta.create({
          data: {
            empresaId: ctx.empresaId,
            negocioId,
            cajaId: caja.id,
            usuarioId: ctx.usuarioId,
            clienteId: entrada.clienteId ?? null,
            consecutivo,
            subtotal: totales.subtotal,
            descuento: totales.descuento,
            base: totales.base,
            iva: totales.iva,
            total: totales.total,
            recibido: pago.recibido,
            cambio: pago.cambio,
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
              precioUnitario: l.producto.precioVenta,
              costoUnitario: l.producto.costo,
              porcentajeIva: l.producto.porcentajeIva,
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
        for (const [productoId, cantidad] of [...pedido].sort(([a], [b]) => (a < b ? -1 : 1))) {
          await registrarMovimiento(tx, ctx, {
            productoId,
            tipo: "VENTA",
            cantidad: cantidad.negated(),
            nota: `Venta Nº ${consecutivo}`,
          });
        }
        return { ok: true as const, id: venta.id, consecutivo, total: totales.total, cambio: pago.cambio };
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    return comoResultado(error);
  }
}

// ─── Anular y devolver ──────────────────────────────────────────────────────

/** El cajero solo puede anular o devolver ventas de la caja de hoy. */
async function exigirPermisoSobreVenta(ctx: Contexto, venta: { cajaId: string }) {
  if (puedeGestionar(ctx)) return;
  const caja = await datosDe(ctx).caja.findFirst({ where: { id: venta.cajaId }, select: { fecha: true } });
  if (!caja || caja.fecha.getTime() !== fechaDeHoy().getTime()) {
    throw new ErrorVenta("Solo puedes anular o devolver ventas de hoy. Pídeselo al administrador.");
  }
}

export async function anularVenta(ctx: Contexto, ventaId: string, motivo: string): Promise<Resultado> {
  const motivoLimpio = motivo.trim();
  if (motivoLimpio.length < 3) {
    return { ok: false, error: "Escribe el motivo de la anulación.", campos: { motivo: "Es obligatorio." } };
  }
  const venta = await datosDe(ctx).venta.findFirst({
    where: { id: ventaId },
    select: { id: true, negocioId: true, cajaId: true, estado: true, consecutivo: true, total: true },
  });
  if (!venta) return { ok: false, error: "No encontramos esa venta." };
  if (venta.estado === "ANULADA") return { ok: false, error: "Esta venta ya está anulada." };
  if (venta.estado === "CON_DEVOLUCION") {
    return { ok: false, error: "Esta venta ya tiene una devolución. Registra otra devolución por lo que falta." };
  }

  try {
    await exigirPermisoSobreVenta(ctx, venta);
    await prisma.$transaction(async (tx) => {
      const caja = await cajaAbiertaDeHoy(tx, ctx, venta.negocioId);
      if (!caja) throw new ErrorVenta("Abre la caja de hoy para poder anular: el dinero sale de ella.");

      // Solo una anulación gana aunque dos personas la hagan al mismo tiempo.
      const { count } = await tx.venta.updateMany({
        where: { id: venta.id, estado: "REGISTRADA" },
        data: {
          estado: "ANULADA",
          anuladaEn: new Date(),
          anuladaPorId: ctx.usuarioId,
          anuladaEnCajaId: caja.id,
          motivoAnulacion: motivoLimpio.slice(0, 300),
        },
      });
      if (!count) throw new ErrorVenta("Esta venta ya no se puede anular: alguien la modificó hace un momento.");

      const detalles = await tx.detalleVenta.findMany({
        where: { ventaId: venta.id },
        select: { productoId: true, cantidad: true },
        orderBy: { productoId: "asc" },
      });
      const porProducto = new Map<string, Decimal>();
      for (const d of detalles) {
        porProducto.set(d.productoId, (porProducto.get(d.productoId) ?? new Decimal(0)).plus(d.cantidad.toString()));
      }
      for (const [productoId, cantidad] of porProducto) {
        await registrarMovimiento(tx, ctx, {
          productoId,
          tipo: "ANULACION",
          cantidad,
          nota: `Anulación venta Nº ${venta.consecutivo}`,
          permitirNegativo: true,
        });
      }
      await registrarAuditoria(tx, ctx, {
        negocioId: venta.negocioId,
        accion: "ANULACION_VENTA",
        entidad: "Venta",
        entidadId: venta.id,
        detalle: { consecutivo: venta.consecutivo, total: venta.total, motivo: motivoLimpio },
      });
    });
    return { ok: true, id: venta.id };
  } catch (error) {
    return comoResultado(error);
  }
}

export type EntradaDevolucion = {
  lineas: { detalleVentaId: string; cantidad: string }[];
  motivo: string;
  medio: MedioPago;
};

export async function registrarDevolucion(
  ctx: Contexto,
  ventaId: string,
  entrada: EntradaDevolucion,
): Promise<Resultado<{ id: string; consecutivo: number; total: number }>> {
  const motivo = entrada.motivo.trim();
  if (motivo.length < 3) return { ok: false, error: "Escribe el motivo de la devolución.", campos: { motivo: "Es obligatorio." } };
  const pedidas = entrada.lineas.filter((l) => l.cantidad.trim() && l.cantidad.trim() !== "0");
  if (!pedidas.length) return { ok: false, error: "Escribe cuánto se devuelve de al menos un producto." };

  const venta = await datosDe(ctx).venta.findFirst({
    where: { id: ventaId },
    select: { id: true, negocioId: true, cajaId: true, estado: true, consecutivo: true },
  });
  if (!venta) return { ok: false, error: "No encontramos esa venta." };
  if (venta.estado === "ANULADA") return { ok: false, error: "Esta venta está anulada." };

  try {
    await exigirPermisoSobreVenta(ctx, venta);
    return await prisma.$transaction(async (tx) => {
      const caja = await cajaAbiertaDeHoy(tx, ctx, venta.negocioId);
      if (!caja) throw new ErrorVenta("Abre la caja de hoy para registrar la devolución.");

      // Bloquea las líneas de la venta para que dos devoluciones no devuelvan lo mismo.
      const detalles = await tx.$queryRaw<
        { id: string; productoId: string; nombre: string; unidad: string; cantidad: Prisma.Decimal; cantidadDevuelta: Prisma.Decimal; total: number; porcentajeIva: number }[]
      >`SELECT "id", "productoId", "nombre", "unidad", "cantidad", "cantidadDevuelta", "total", "porcentajeIva"
        FROM "DetalleVenta" WHERE "ventaId" = ${venta.id} ORDER BY "id" FOR UPDATE`;
      const porId = new Map(detalles.map((d) => [d.id, d]));
      const yaDevuelto = await tx.detalleDevolucion.groupBy({
        by: ["detalleVentaId"],
        where: { detalleVenta: { ventaId: venta.id } },
        _sum: { total: true },
      });
      const dineroDevuelto = new Map(yaDevuelto.map((d) => [d.detalleVentaId, d._sum.total ?? 0]));

      const lineas = pedidas.map((l) => {
        const d = porId.get(l.detalleVentaId);
        if (!d) throw new ErrorVenta("Uno de los productos no pertenece a esta venta.");
        const cantidad = leerCantidad(l.cantidad);
        const error = validarCantidad(cantidad, { fraccionado: d.unidad !== "UNIDAD" });
        if (error || !cantidad || cantidad.isZero()) throw new ErrorVenta(`${d.nombre}: ${MENSAJES_CANTIDAD[error ?? "invalida"]}`);
        const vendida = new Decimal(d.cantidad.toString());
        const pendiente = vendida.minus(d.cantidadDevuelta.toString());
        if (cantidad.greaterThan(pendiente)) {
          throw new ErrorVenta(`${d.nombre}: solo se pueden devolver ${formatearCantidad(pendiente)}.`);
        }
        // Si devuelve todo lo que queda, se devuelve exactamente el dinero que falta (sin pesos de más por redondeo).
        const total = cantidad.equals(pendiente)
          ? d.total - (dineroDevuelto.get(d.id) ?? 0)
          : new Decimal(d.total).times(cantidad).dividedBy(vendida).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
        return { detalle: d, cantidad, total, ...separarIva(total, d.porcentajeIva) };
      });

      const total = lineas.reduce((a, l) => a + l.total, 0);
      const consecutivo = await siguienteConsecutivo(tx, venta.negocioId, "consecutivoDevolucion");
      const devolucion = await tx.devolucion.create({
        data: {
          empresaId: ctx.empresaId,
          negocioId: venta.negocioId,
          ventaId: venta.id,
          cajaId: caja.id,
          usuarioId: ctx.usuarioId,
          consecutivo,
          motivo: motivo.slice(0, 300),
          medio: entrada.medio,
          base: lineas.reduce((a, l) => a + l.base, 0),
          iva: lineas.reduce((a, l) => a + l.iva, 0),
          total,
        },
        select: { id: true },
      });
      await tx.detalleDevolucion.createMany({
        data: lineas.map((l) => ({
          empresaId: ctx.empresaId,
          negocioId: venta.negocioId,
          devolucionId: devolucion.id,
          detalleVentaId: l.detalle.id,
          productoId: l.detalle.productoId,
          cantidad: l.cantidad.toString(),
          base: l.base,
          iva: l.iva,
          total: l.total,
        })),
      });
      for (const l of lineas) {
        await tx.detalleVenta.update({
          where: { id: l.detalle.id },
          data: { cantidadDevuelta: new Decimal(l.detalle.cantidadDevuelta.toString()).plus(l.cantidad).toString() },
        });
      }
      await tx.venta.update({ where: { id: venta.id }, data: { estado: "CON_DEVOLUCION" } });
      for (const l of [...lineas].sort((a, b) => (a.detalle.productoId < b.detalle.productoId ? -1 : 1))) {
        await registrarMovimiento(tx, ctx, {
          productoId: l.detalle.productoId,
          tipo: "DEVOLUCION",
          cantidad: l.cantidad,
          nota: `Devolución Nº ${consecutivo} de la venta Nº ${venta.consecutivo}`,
          permitirNegativo: true,
        });
      }
      await registrarAuditoria(tx, ctx, {
        negocioId: venta.negocioId,
        accion: "DEVOLUCION_VENTA",
        entidad: "Venta",
        entidadId: venta.id,
        detalle: { venta: venta.consecutivo, devolucion: consecutivo, total, medio: entrada.medio, motivo },
      });
      return { ok: true as const, id: devolucion.id, consecutivo, total };
    });
  } catch (error) {
    return comoResultado(error);
  }
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export type FiltroVentas = {
  desde?: Date;
  hasta?: Date;
  usuarioId?: string;
  medio?: MedioPago;
  pagina?: number;
};

export const VENTAS_POR_PAGINA = 50;

export async function listarVentas(ctx: Contexto, negocioId: string, filtro: FiltroVentas = {}) {
  exigirNegocioPermitido(ctx, negocioId);
  const datos = datosDe(ctx);
  const where: Prisma.VentaWhereInput = {
    negocioId,
    ...(filtro.desde || filtro.hasta
      ? { creadoEn: { ...(filtro.desde ? { gte: filtro.desde } : {}), ...(filtro.hasta ? { lt: filtro.hasta } : {}) } }
      : {}),
    ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
    ...(filtro.medio ? { pagos: { some: { medio: filtro.medio } } } : {}),
  };
  const pagina = Math.max(1, filtro.pagina ?? 1);
  const [ventas, total, suma] = await Promise.all([
    datos.venta.findMany({
      where,
      select: {
        id: true, consecutivo: true, creadoEn: true, total: true, estado: true, usuarioId: true, clienteId: true,
      },
      orderBy: { consecutivo: "desc" },
      skip: (pagina - 1) * VENTAS_POR_PAGINA,
      take: VENTAS_POR_PAGINA,
    }),
    datos.venta.count({ where }),
    datos.venta.aggregate({ where: { ...where, estado: { not: "ANULADA" } }, _sum: { total: true } }),
  ]);
  const ids = ventas.map((v) => v.id);
  const [pagos, usuarios, clientes] = await Promise.all([
    datos.pagoVenta.findMany({ where: { ventaId: { in: ids } }, select: { ventaId: true, medio: true } }),
    datos.usuario.findMany({ where: { id: { in: [...new Set(ventas.map((v) => v.usuarioId))] } }, select: { id: true, nombre: true } }),
    datos.cliente.findMany({
      where: { id: { in: ventas.map((v) => v.clienteId).filter((x): x is string => !!x) } },
      select: { id: true, nombre: true },
    }),
  ]);
  const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]));
  return {
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / VENTAS_POR_PAGINA)),
    sumaTotal: suma._sum.total ?? 0,
    ventas: ventas.map((v) => ({
      ...v,
      cajero: nombreUsuario.get(v.usuarioId) ?? "",
      cliente: v.clienteId ? (nombreCliente.get(v.clienteId) ?? "") : null,
      medios: [...new Set(pagos.filter((p) => p.ventaId === v.id).map((p) => p.medio))],
    })),
  };
}

/** Cajeros que han vendido en el negocio (para el filtro del historial). */
export async function listarCajerosConVentas(ctx: Contexto, negocioId: string) {
  exigirNegocioPermitido(ctx, negocioId);
  const datos = datosDe(ctx);
  const grupos = await datos.venta.groupBy({ by: ["usuarioId"], where: { negocioId } });
  return datos.usuario.findMany({
    where: { id: { in: grupos.map((g) => g.usuarioId) } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

export async function obtenerVenta(ctx: Contexto, id: string) {
  const datos = datosDe(ctx);
  const venta = await datos.venta.findFirst({
    where: { id },
    select: {
      id: true, negocioId: true, cajaId: true, usuarioId: true, clienteId: true, consecutivo: true, creadoEn: true,
      subtotal: true, descuento: true, base: true, iva: true, total: true, recibido: true, cambio: true,
      estado: true, anuladaEn: true, anuladaPorId: true, motivoAnulacion: true,
    },
  });
  if (!venta) return null;
  const verCostos = puedeVerCostos(ctx);
  const [detalles, pagos, devoluciones, usuarios, cliente, caja] = await Promise.all([
    datos.detalleVenta.findMany({
      where: { ventaId: id },
      select: {
        id: true, productoId: true, codigo: true, nombre: true, unidad: true, cantidad: true, cantidadDevuelta: true,
        precioUnitario: true, costoUnitario: verCostos, porcentajeIva: true, subtotal: true, descuento: true,
        base: true, iva: true, total: true,
      },
      orderBy: { id: "asc" },
    }),
    datos.pagoVenta.findMany({ where: { ventaId: id }, select: { medio: true, valor: true, referencia: true } }),
    datos.devolucion.findMany({
      where: { ventaId: id },
      select: { id: true, consecutivo: true, creadoEn: true, motivo: true, medio: true, total: true, usuarioId: true },
      orderBy: { consecutivo: "asc" },
    }),
    datos.usuario.findMany({
      where: { id: { in: [venta.usuarioId, venta.anuladaPorId].filter((x): x is string => !!x) } },
      select: { id: true, nombre: true },
    }),
    venta.clienteId
      ? datos.cliente.findFirst({
          where: { id: venta.clienteId },
          select: { nombre: true, tipoDocumento: true, numeroDocumento: true, telefono: true },
        })
      : null,
    datos.caja.findFirst({ where: { id: venta.cajaId }, select: { fecha: true } }),
  ]);
  const nombre = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const esDeHoy = caja?.fecha.getTime() === fechaDeHoy().getTime();
  return {
    ...venta,
    cajero: nombre.get(venta.usuarioId) ?? "",
    anuladaPor: venta.anuladaPorId ? (nombre.get(venta.anuladaPorId) ?? "") : null,
    cliente,
    detalles: detalles.map((d) => ({
      ...d,
      cantidad: d.cantidad.toString(),
      cantidadDevuelta: d.cantidadDevuelta.toString(),
      costoUnitario: verCostos ? (d as { costoUnitario?: number }).costoUnitario ?? null : null,
    })),
    pagos,
    devoluciones,
    /** Si quien consulta puede anular o devolver esta venta. */
    puedeCorregir: venta.estado !== "ANULADA" && (puedeGestionar(ctx) || esDeHoy),
  };
}

