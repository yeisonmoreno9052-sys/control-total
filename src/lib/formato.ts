// Formatos de Colombia: pesos sin decimales y fechas dd/mm/aaaa en hora de Bogotá.

export const ZONA_HORARIA = "America/Bogota";

const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const fecha = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA_HORARIA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const hora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA_HORARIA,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** 1250000 → "$ 1.250.000". El dinero siempre se maneja en pesos enteros. */
export function formatearPesos(valor: number) {
  const signo = valor < 0 ? "-" : "";
  return `${signo}$ ${numero.format(Math.abs(Math.round(valor)))}`;
}

/** Fecha en formato dd/mm/aaaa, hora de Bogotá. */
export function formatearFecha(valor: Date) {
  return fecha.format(valor);
}

/** Hora en formato 3:45 p. m., hora de Bogotá. */
export function formatearHora(valor: Date) {
  return hora.format(valor);
}

const diaBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día en Bogotá como "2026-10-07". */
export function diaEnBogota(valor: Date = new Date()) {
  return diaBogota.format(valor);
}

/**
 * Día en Bogotá como fecha para columnas DATE de la base (medianoche UTC de ese día).
 * Ej.: el 7 de octubre a las 9 p. m. en Bogotá ya es 8 de octubre en UTC, pero aquí da 2026-10-07.
 */
export function fechaDeHoy(valor: Date = new Date()) {
  return new Date(`${diaEnBogota(valor)}T00:00:00.000Z`);
}

/** Fecha de una columna DATE ("2026-10-07T00:00Z") como dd/mm/aaaa, sin correrla por la zona horaria. */
export function formatearDia(valor: Date) {
  const [a, m, d] = valor.toISOString().slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Inicio y fin (exclusivo) de un día de Bogotá, en UTC. "2026-10-07" → [05:00Z del 7, 05:00Z del 8). */
export function rangoDelDia(dia: string) {
  const inicio = new Date(`${dia}T00:00:00-05:00`);
  return { inicio, fin: new Date(inicio.getTime() + 24 * 60 * 60 * 1000) };
}
