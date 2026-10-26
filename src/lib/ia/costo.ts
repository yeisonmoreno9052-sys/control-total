// Costo aproximado de una lectura, en pesos.
// Precios en dólares por millón de tokens (entrada, salida).
const PRECIOS: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
};
const PRECIO_POR_DEFECTO: [number, number] = [5, 25];

export function dolarEnPesos() {
  const v = Number(process.env.DOLAR_EN_PESOS);
  return Number.isFinite(v) && v > 0 ? v : 4000;
}

export function costoEnPesos(modelo: string, tokensEntrada: number, tokensSalida: number, dolar = dolarEnPesos()) {
  const [entrada, salida] = PRECIOS[modelo] ?? PRECIO_POR_DEFECTO;
  const dolares = (tokensEntrada * entrada + tokensSalida * salida) / 1_000_000;
  return Math.round(dolares * dolar);
}
