// Cantidades de inventario: hasta 3 decimales. Se manejan como texto ("2.5")
// para no perder precisión con números de JavaScript; la base las guarda como DECIMAL.
import { Decimal } from "decimal.js";

export { Decimal };

/**
 * Convierte lo que escribe la persona ("2,5", "0.350", "1.250", " 3 ") en un Decimal.
 * En Colombia la coma es el separador decimal; si solo hay puntos y el último
 * grupo tiene 3 dígitos ("1.250") se toma como separador de miles.
 * Devuelve null si no es un número válido.
 */
export function leerCantidad(texto: string | number | null | undefined): Decimal | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? new Decimal(texto) : null;
  let t = texto.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return new Decimal(t);
}

export type ErrorCantidad = "invalida" | "negativa" | "decimales" | "entera";

/** Revisa que una cantidad sirva para un producto. */
export function validarCantidad(
  cantidad: Decimal | null,
  opciones: { fraccionado: boolean; permitirNegativa?: boolean },
): ErrorCantidad | null {
  if (!cantidad) return "invalida";
  if (!opciones.permitirNegativa && cantidad.isNegative()) return "negativa";
  if (cantidad.decimalPlaces() > 3) return "decimales";
  if (!opciones.fraccionado && !cantidad.isInteger()) return "entera";
  return null;
}

export const MENSAJES_CANTIDAD: Record<ErrorCantidad, string> = {
  invalida: "Escribe una cantidad válida.",
  negativa: "La cantidad no puede ser negativa.",
  decimales: "Usa máximo 3 decimales.",
  entera: "Este producto se maneja en unidades completas, sin decimales.",
};

/** 2.5 → "2,5" · 1250 → "1.250" · 0.35 → "0,35" */
export function formatearCantidad(valor: Decimal | string | number) {
  const d = new Decimal(valor.toString());
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(d.toNumber());
}
