import { describe, expect, it } from "vitest";
import { logoBlancoYNegro } from "@/lib/etiquetas/logo-bn";

const pixeles = (...colores: [number, number, number, number][]) => new Uint8ClampedArray(colores.flat());
const valores = (px: Uint8ClampedArray) => Array.from({ length: px.length / 4 }, (_, i) => px[i * 4]);

describe("logo para la etiqueta", () => {
  it("un logo oscuro con letras doradas se invierte: fondo blanco y letras negras", () => {
    const negro: [number, number, number, number] = [10, 10, 10, 255];
    const dorado: [number, number, number, number] = [190, 140, 50, 255];
    const doradoOscuro: [number, number, number, number] = [150, 100, 30, 255];
    const px = pixeles(negro, negro, negro, dorado, doradoOscuro, [0, 0, 0, 0]);
    expect(logoBlancoYNegro(px).invertido).toBe(true);
    expect(valores(px)).toEqual([255, 255, 255, 0, 0, 255]);
  });

  it("un logo claro queda como está: lo oscuro sale negro", () => {
    const blanco: [number, number, number, number] = [250, 250, 250, 255];
    const px = pixeles(blanco, blanco, blanco, [20, 40, 120, 255]);
    expect(logoBlancoYNegro(px).invertido).toBe(false);
    expect(valores(px)).toEqual([255, 255, 255, 0]);
  });
});
