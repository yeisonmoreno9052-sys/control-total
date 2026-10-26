// Cálculos para convertir lo que la IA leyó de una factura en líneas de la factura de compra.
// Sin base de datos: se prueban solos.
import type { LineaLeida } from "@/lib/ia/factura";

/**
 * Costo unitario con IVA incluido, en pesos enteros (así se lleva el costo en la fase 3).
 * Aplica el descuento de la línea y, si el valor venía antes de IVA, le suma el IVA.
 */
export function costoConIva(l: Pick<LineaLeida, "valorUnitario" | "incluyeIva" | "porcentajeIva" | "descuentoPorcentaje">) {
  if (!Number.isFinite(l.valorUnitario) || l.valorUnitario <= 0) return 0;
  const descuento = Math.min(Math.max(l.descuentoPorcentaje ?? 0, 0), 100);
  const iva = l.incluyeIva ? 0 : Math.min(Math.max(l.porcentajeIva ?? 0, 0), 100);
  return Math.round(l.valorUnitario * (1 - descuento / 100) * (1 + iva / 100));
}

/**
 * Cantidad como texto para el formulario, con hasta 3 decimales y coma decimal
 * ("12,125"; con punto se leería como doce mil ciento veinticinco). "" si no sirve.
 */
export function cantidadTexto(cantidad: number) {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return "";
  return String(Math.round(cantidad * 1000) / 1000).replace(".", ",");
}

/** NIT sin dígito de verificación ni separadores: "900.123.456-7" → "900123456". */
export function normalizarNit(nit: string | null | undefined) {
  if (!nit) return "";
  const sinDv = nit.split("-")[0];
  return sinDv.replace(/\D/g, "");
}

/** Mismo NIT aunque uno traiga el dígito de verificación pegado ("9001234567" y "900.123.456-7"). */
export function mismoNit(a: string | null | undefined, b: string | null | undefined) {
  const x = normalizarNit(a);
  const y = normalizarNit(b);
  if (x.length < 6 || y.length < 6) return false;
  return x === y || (x.length === y.length + 1 && x.startsWith(y)) || (y.length === x.length + 1 && y.startsWith(x));
}

/** Texto para comparar: minúsculas, sin tildes y sin signos. */
export function normalizarTexto(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Qué tanto se parecen dos nombres, de 0 a 1 (palabras en común). */
export function parecido(a: string, b: string) {
  const pa = new Set(normalizarTexto(a).split(" ").filter((p) => p.length > 1));
  const pb = new Set(normalizarTexto(b).split(" ").filter((p) => p.length > 1));
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  return comunes / Math.max(pa.size, pb.size);
}

/** Fecha leída con formato válido (AAAA-MM-DD que existe). Si no, null. */
export function fechaValida(dia: string | null | undefined) {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const d = new Date(`${dia}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia) return null;
  return dia;
}

/** La suma de las líneas no coincide con el total impreso (tolerancia: 1 % o $ 100). */
export function totalNoCuadra(suma: number, totalImpreso: number | null | undefined) {
  if (!totalImpreso || totalImpreso <= 0) return false;
  return Math.abs(suma - totalImpreso) > Math.max(100, totalImpreso * 0.01);
}
