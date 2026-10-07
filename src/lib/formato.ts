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
