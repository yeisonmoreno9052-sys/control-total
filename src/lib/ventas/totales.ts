// Cálculo de los totales de una venta. Lo usan la pantalla de caja (para
// mostrar) y el servidor (para guardar), así los números siempre coinciden.
//
// Reglas:
// - El precio de venta ya incluye el IVA.
// - Todo se redondea al peso: no hay centavos.
// - El descuento general se reparte entre las líneas en proporción a su valor,
//   para que la base y el IVA de cada línea queden correctos.
import { Decimal } from "@/lib/inventario/cantidades";

export type Descuento = { tipo: "pesos" | "porcentaje"; valor: number };

export type LineaEntrada = {
  precioUnitario: number;
  /** Texto o Decimal: "2.5" */
  cantidad: Decimal | string;
  porcentajeIva: number;
  descuento?: Descuento | null;
};

export type LineaCalculada = {
  /** cantidad × precio, antes de descuentos. */
  subtotal: number;
  /** Descuento propio de la línea. */
  descuentoLinea: number;
  /** Parte del descuento general que le toca a la línea. */
  descuentoGeneral: number;
  /** descuentoLinea + descuentoGeneral */
  descuento: number;
  base: number;
  iva: number;
  total: number;
};

export type TotalesVenta = {
  lineas: LineaCalculada[];
  subtotal: number;
  descuento: number;
  base: number;
  iva: number;
  total: number;
};

export class ErrorTotales extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorTotales";
  }
}

/** Redondeo al peso: ,5 sube. */
function redondear(valor: Decimal) {
  return valor.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function valorDescuento(descuento: Descuento | null | undefined, sobre: number) {
  if (!descuento || !descuento.valor) return 0;
  if (!Number.isFinite(descuento.valor) || descuento.valor < 0) {
    throw new ErrorTotales("El descuento no puede ser negativo.");
  }
  if (descuento.tipo === "porcentaje") {
    if (descuento.valor > 100) throw new ErrorTotales("El descuento no puede pasar del 100 %.");
    return redondear(new Decimal(sobre).times(descuento.valor).dividedBy(100));
  }
  const pesos = Math.round(descuento.valor);
  if (pesos > sobre) throw new ErrorTotales("El descuento es mayor que el valor a pagar.");
  return pesos;
}

/** Separa la base y el IVA de un valor que ya incluye IVA. */
export function separarIva(total: number, porcentajeIva: number) {
  const base = redondear(new Decimal(total).dividedBy(new Decimal(100 + porcentajeIva).dividedBy(100)));
  return { base, iva: total - base };
}

/**
 * Reparte `monto` entre `pesos` en proporción a cada uno, sin perder ni sobrar
 * un peso (método del mayor residuo).
 */
export function repartir(monto: number, pesos: number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (monto === 0 || suma === 0) return pesos.map(() => 0);
  const exactos = pesos.map((p) => new Decimal(monto).times(p).dividedBy(suma));
  const partes = exactos.map((e) => e.floor().toNumber());
  let faltan = monto - partes.reduce((a, b) => a + b, 0);
  const orden = exactos
    .map((e, i) => ({ i, resto: e.minus(e.floor()).toNumber() }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of orden) {
    if (faltan <= 0) break;
    partes[i] += 1;
    faltan -= 1;
  }
  return partes;
}

export function calcularTotales(lineas: LineaEntrada[], descuentoGeneral?: Descuento | null): TotalesVenta {
  const preparadas = lineas.map((l) => {
    const cantidad = new Decimal(l.cantidad.toString());
    if (cantidad.lte(0)) throw new ErrorTotales("La cantidad debe ser mayor que cero.");
    if (!Number.isInteger(l.precioUnitario) || l.precioUnitario < 0) {
      throw new ErrorTotales("El precio no es válido.");
    }
    const subtotal = redondear(cantidad.times(l.precioUnitario));
    const descuentoLinea = valorDescuento(l.descuento, subtotal);
    return { subtotal, descuentoLinea, neto: subtotal - descuentoLinea, porcentajeIva: l.porcentajeIva };
  });

  const sumaNeto = preparadas.reduce((a, l) => a + l.neto, 0);
  const general = valorDescuento(descuentoGeneral, sumaNeto);
  const partes = repartir(general, preparadas.map((l) => l.neto));

  const calculadas: LineaCalculada[] = preparadas.map((l, i) => {
    const total = l.neto - partes[i];
    const { base, iva } = separarIva(total, l.porcentajeIva);
    return {
      subtotal: l.subtotal,
      descuentoLinea: l.descuentoLinea,
      descuentoGeneral: partes[i],
      descuento: l.descuentoLinea + partes[i],
      base,
      iva,
      total,
    };
  });

  const sumar = (campo: keyof LineaCalculada) => calculadas.reduce((a, l) => a + l[campo], 0);
  return {
    lineas: calculadas,
    subtotal: sumar("subtotal"),
    descuento: sumar("descuento"),
    base: sumar("base"),
    iva: sumar("iva"),
    total: sumar("total"),
  };
}

// ─── Pagos ──────────────────────────────────────────────────────────────────

export type FormaPago =
  | { forma: "efectivo"; recibido: number }
  | { forma: "transferencia"; referencia?: string | null }
  | { forma: "mixto"; transferencia: number; recibido: number; referencia?: string | null };

export type PagoCalculado = {
  pagos: { medio: "EFECTIVO" | "TRANSFERENCIA"; valor: number; referencia: string | null }[];
  recibido: number | null;
  cambio: number | null;
};

/** Reparte el total entre los medios de pago y calcula el cambio. */
export function calcularPago(total: number, forma: FormaPago): PagoCalculado {
  const referencia = (r?: string | null) => r?.trim() || null;
  if (forma.forma === "transferencia") {
    return { pagos: [{ medio: "TRANSFERENCIA", valor: total, referencia: referencia(forma.referencia) }], recibido: null, cambio: null };
  }
  if (forma.forma === "efectivo") {
    const recibido = Math.round(forma.recibido);
    if (!(recibido >= total)) throw new ErrorTotales("El efectivo recibido no alcanza para pagar el total.");
    return { pagos: [{ medio: "EFECTIVO", valor: total, referencia: null }], recibido, cambio: recibido - total };
  }
  const transferencia = Math.round(forma.transferencia);
  if (!(transferencia > 0 && transferencia < total)) {
    throw new ErrorTotales("En el pago mixto la transferencia debe ser mayor que cero y menor que el total.");
  }
  const efectivo = total - transferencia;
  const recibido = Math.round(forma.recibido);
  if (!(recibido >= efectivo)) throw new ErrorTotales("El efectivo recibido no alcanza para la parte en efectivo.");
  return {
    pagos: [
      { medio: "EFECTIVO", valor: efectivo, referencia: null },
      { medio: "TRANSFERENCIA", valor: transferencia, referencia: referencia(forma.referencia) },
    ],
    recibido,
    cambio: recibido - efectivo,
  };
}
