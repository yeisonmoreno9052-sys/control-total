import { formatearPesos } from "@/lib/formato";
import type { Celda, TipoDato } from "@/lib/reportes/armar";

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

export function formatearCelda(valor: Celda, tipo: TipoDato) {
  if (valor === null) return "—";
  if (typeof valor === "string") return valor;
  if (tipo === "pesos") return formatearPesos(valor);
  if (tipo === "porcentaje") return `${numero.format(valor)} %`;
  return numero.format(valor);
}
