// Rangos de fechas para reportes: hoy, ayer, esta semana (lunes a domingo), este mes, mes pasado
// o fechas libres. Los días son "aaaa-mm-dd" en hora de Bogotá; desde y hasta van incluidos.
import { diaEnBogota } from "@/lib/formato";

export type Preset = "hoy" | "ayer" | "semana" | "mes" | "mes-pasado" | "libre";

export const PRESETS: { valor: Exclude<Preset, "libre">; nombre: string }[] = [
  { valor: "hoy", nombre: "Hoy" },
  { valor: "ayer", nombre: "Ayer" },
  { valor: "semana", nombre: "Esta semana" },
  { valor: "mes", nombre: "Este mes" },
  { valor: "mes-pasado", nombre: "Mes pasado" },
];

export type Periodo = { preset: Preset; desde: string; hasta: string };

const aUtc = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const aDia = (d: Date) => d.toISOString().slice(0, 10);
export const esDia = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(aUtc(v).getTime());

export function sumarDias(dia: string, n: number) {
  const d = aUtc(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return aDia(d);
}

/** Días entre dos fechas, contando ambas. */
export function diasEntre(desde: string, hasta: string) {
  return Math.round((aUtc(hasta).getTime() - aUtc(desde).getTime()) / 86_400_000) + 1;
}

/** Lunes de la semana del día. */
export function inicioSemana(dia: string) {
  const semana = (aUtc(dia).getUTCDay() + 6) % 7; // lunes = 0
  return sumarDias(dia, -semana);
}

export const inicioMes = (dia: string) => `${dia.slice(0, 7)}-01`;

function finMes(dia: string) {
  const d = aUtc(inicioMes(dia));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return aDia(d);
}

/** Mismo día del mes anterior (el 31 de marzo → 28 o 29 de febrero). */
function mismoDiaMesAnterior(dia: string) {
  const anterior = sumarDias(inicioMes(dia), -1);
  const ultimo = Number(anterior.slice(8));
  return `${anterior.slice(0, 8)}${String(Math.min(Number(dia.slice(8)), ultimo)).padStart(2, "0")}`;
}

export function calcularPeriodo(preset: Preset, hoy = diaEnBogota(), desde?: string, hasta?: string): Periodo {
  switch (preset) {
    case "hoy":
      return { preset, desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { preset, desde: ayer, hasta: ayer };
    }
    case "semana":
      return { preset, desde: inicioSemana(hoy), hasta: hoy };
    case "mes":
      return { preset, desde: inicioMes(hoy), hasta: hoy };
    case "mes-pasado": {
      const algunDia = sumarDias(inicioMes(hoy), -1);
      return { preset, desde: inicioMes(algunDia), hasta: finMes(algunDia) };
    }
    case "libre": {
      let d = esDia(desde) ? desde : inicioMes(hoy);
      let h = esDia(hasta) ? hasta : hoy;
      if (d > h) [d, h] = [h, d];
      // Más de dos años de un golpe no tiene sentido en pantalla y pesa en la base.
      if (diasEntre(d, h) > 731) d = sumarDias(h, -730);
      return { preset, desde: d, hasta: h };
    }
  }
}

/** Lee el periodo de la dirección (?periodo=mes o ?desde=…&hasta=…). Por defecto, este mes. */
export function periodoDeParametros(
  p: Record<string, string | string[] | undefined>,
  porDefecto: Preset = "mes",
  hoy = diaEnBogota(),
) {
  const valor = typeof p.periodo === "string" ? p.periodo : undefined;
  if (esDia(p.desde) || esDia(p.hasta)) {
    return calcularPeriodo("libre", hoy, p.desde as string | undefined, p.hasta as string | undefined);
  }
  const preset = PRESETS.some((x) => x.valor === valor) ? (valor as Preset) : porDefecto;
  return calcularPeriodo(preset, hoy);
}

/**
 * Periodo anterior para comparar: el día anterior, la semana anterior hasta el mismo día,
 * el mes anterior hasta el mismo día, o el mismo número de días justo antes.
 */
export function periodoAnterior(p: Periodo): Periodo {
  if (p.preset === "semana") return { preset: "libre", desde: sumarDias(p.desde, -7), hasta: sumarDias(p.hasta, -7) };
  if (p.preset === "mes")
    return { preset: "libre", desde: inicioMes(mismoDiaMesAnterior(p.hasta)), hasta: mismoDiaMesAnterior(p.hasta) };
  if (p.preset === "mes-pasado") {
    const algunDia = sumarDias(p.desde, -1);
    return { preset: "libre", desde: inicioMes(algunDia), hasta: finMes(algunDia) };
  }
  const n = diasEntre(p.desde, p.hasta);
  return { preset: "libre", desde: sumarDias(p.desde, -n), hasta: sumarDias(p.hasta, -n) };
}

/** Cambio en porcentaje frente al periodo anterior; null si antes fue cero. */
export function variacion(actual: number, anterior: number) {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

/** Inicio (incluido) y fin (excluido) del rango en UTC, para columnas con hora (creadoEn). */
export function rangoUtc(desde: string, hasta: string) {
  return { inicio: new Date(`${desde}T00:00:00-05:00`), fin: new Date(`${sumarDias(hasta, 1)}T00:00:00-05:00`) };
}

/** Todos los días del periodo, para gráficas sin huecos. */
export function diasDelPeriodo(desde: string, hasta: string) {
  const dias: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

const NOMBRE_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "1 al 7 de octubre de 2026", "hoy, 07/10/2026"… para títulos y archivos. */
export function describirPeriodo(p: Pick<Periodo, "desde" | "hasta">) {
  const [ad, md, dd] = p.desde.split("-").map(Number);
  const [ah, mh, dh] = p.hasta.split("-").map(Number);
  if (p.desde === p.hasta) return `${dd} de ${NOMBRE_MES[md - 1]} de ${ad}`;
  if (ad === ah && md === mh) return `${dd} al ${dh} de ${NOMBRE_MES[mh - 1]} de ${ah}`;
  if (ad === ah) return `${dd} de ${NOMBRE_MES[md - 1]} al ${dh} de ${NOMBRE_MES[mh - 1]} de ${ah}`;
  return `${dd} de ${NOMBRE_MES[md - 1]} de ${ad} al ${dh} de ${NOMBRE_MES[mh - 1]} de ${ah}`;
}
