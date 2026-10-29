// Imagen suave que una empresa puede llevar en la franja de color del Inicio (ej. el caballo
// de Club Cabbali). Las imágenes son siluetas blancas en public/fondos/: la cabeza sale del
// símbolo ♞ de DejaVu Sans (licencia libre) y el caballo galopando de Noto Emoji (Apache 2.0).

export const FONDOS = [
  { valor: "caballo-cabeza", nombre: "Cabeza de caballo", imagen: "/fondos/caballo-cabeza.png" },
  { valor: "caballo-galope", nombre: "Caballo galopando", imagen: "/fondos/caballo-galope.png" },
] as const;

export type Fondo = (typeof FONDOS)[number]["valor"];

export function esFondo(valor: unknown): valor is Fondo {
  return FONDOS.some((f) => f.valor === valor);
}

/** La imagen del fondo, o null si la empresa no tiene (o el valor guardado ya no existe). */
export function imagenDeFondo(valor: string | null | undefined) {
  return FONDOS.find((f) => f.valor === valor)?.imagen ?? null;
}
