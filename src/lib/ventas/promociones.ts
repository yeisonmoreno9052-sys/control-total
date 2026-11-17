// Promociones con fecha: la caja las aplica solas como un descuento normal de la línea,
// así la venta, la caja, el inventario y la utilidad cuadran igual que con cualquier descuento.
import { Decimal } from "@/lib/inventario/cantidades";
import type { Descuento } from "./totales";

export type PromoCaja = {
  nombre: string;
  tipo: "PORCENTAJE" | "PRECIO";
  /** Porcentaje (1–99) o precio por unidad en pesos. */
  valor: number;
  /** "2026-11-20", días en Bogotá, ambos incluidos. */
  desde: string;
  hasta: string;
};

export function promoVigente(p: PromoCaja | null | undefined, hoy: string): p is PromoCaja {
  return !!p && p.desde <= hoy && hoy <= p.hasta;
}

/** El descuento que pone la promoción en una línea, o null si no aplica (o si el precio ya es menor). */
export function descuentoPromo(p: PromoCaja, precioUnitario: number, cantidad: string): Descuento | null {
  if (p.tipo === "PORCENTAJE") return p.valor > 0 && p.valor < 100 ? { tipo: "porcentaje", valor: p.valor } : null;
  const diferencia = precioUnitario - p.valor;
  if (diferencia <= 0) return null;
  let cant: Decimal;
  try {
    cant = new Decimal(cantidad || "0");
  } catch {
    return null;
  }
  const pesos = cant.times(diferencia).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return pesos > 0 ? { tipo: "pesos", valor: pesos } : null;
}

/** "20 %" o "a $ 35.000" */
export function textoPromo(p: Pick<PromoCaja, "tipo" | "valor">, formatearPesos: (n: number) => string) {
  return p.tipo === "PORCENTAJE" ? `${p.valor} %` : `a ${formatearPesos(p.valor)}`;
}

type LineaConPromo = {
  producto: { precioVenta: number; promo?: PromoCaja | null };
  presentacion?: { precio: number } | null;
  cantidad: string;
  descuento: Descuento | null;
};

/**
 * Las líneas como se cobran: si la línea no tiene un descuento puesto a mano y su producto
 * está en una promoción vigente, se le pone el de la promoción. Un descuento a mano (aunque
 * sea 0) manda sobre la promoción. Los paquetes con precio propio no entran en promoción.
 */
export function aplicarPromociones<L extends LineaConPromo>(lineas: L[], hoy: string): (L & { promo: string | null })[] {
  return lineas.map((l) => {
    const p = l.producto.promo;
    if (l.descuento || l.presentacion || !promoVigente(p, hoy)) return { ...l, promo: null };
    const d = descuentoPromo(p, l.producto.precioVenta, l.cantidad);
    return d ? { ...l, descuento: d, promo: p.nombre } : { ...l, promo: null };
  });
}
