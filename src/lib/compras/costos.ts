// Costo promedio ponderado y estado de pago de las facturas de compra.
import { Decimal } from "@/lib/inventario/cantidades";

/**
 * Nuevo costo promedio al comprar: lo que había, valorizado a su costo, más lo que
 * entra, dividido entre las unidades totales. Redondeado al peso.
 * Ej.: 10 a $ 1.000 + 10 a $ 1.400 → $ 1.200.
 * Si no había stock (o estaba en negativo), el costo pasa a ser el de la compra.
 */
export function costoPromedio(stockAntes: Decimal | string, costoAntes: number, cantidad: Decimal | string, costoUnitario: number) {
  const stock = new Decimal(stockAntes.toString());
  const entra = new Decimal(cantidad.toString());
  if (stock.lte(0)) return costoUnitario;
  return stock
    .times(costoAntes)
    .plus(entra.times(costoUnitario))
    .dividedBy(stock.plus(entra))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Valor de una línea: cantidad × costo, al peso. */
export function totalLinea(cantidad: Decimal | string, costoUnitario: number) {
  return new Decimal(cantidad.toString()).times(costoUnitario).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function estadoDePago(total: number, pagado: number) {
  if (pagado <= 0) return "PENDIENTE" as const;
  if (pagado >= total) return "PAGADA" as const;
  return "ABONO_PARCIAL" as const;
}

export const NOMBRE_ESTADO_PAGO = { PENDIENTE: "Pendiente", ABONO_PARCIAL: "Con abonos", PAGADA: "Pagada" } as const;
