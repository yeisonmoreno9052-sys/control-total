// Aviso de foto oscura o borrosa antes de guardarla.
import { describe, expect, it } from "vitest";
import { aGris, revisarGris } from "@/lib/retoque/calidad";

const ANCHO = 256;
const ALTO = 320;

/** Un tablero de cuadros (nítido) con el brillo dado. */
function tablero(base: number, contraste: number, lado = 8) {
  const rgba = new Uint8ClampedArray(ANCHO * ALTO * 4);
  for (let y = 0; y < ALTO; y++)
    for (let x = 0; x < ANCHO; x++) {
      const v = base + ((Math.floor(x / lado) + Math.floor(y / lado)) % 2 ? contraste : -contraste);
      const i = (y * ANCHO + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  return aGris(rgba, ANCHO, ALTO);
}

/** Desenfoque de caja repetido: como una foto movida. */
function desenfocar(gris: Float32Array, veces = 6) {
  let a = gris;
  for (let k = 0; k < veces; k++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < ALTO; y++)
      for (let x = 0; x < ANCHO; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < ANCHO && yy < ALTO) {
              s += a[yy * ANCHO + xx];
              n++;
            }
          }
        b[y * ANCHO + x] = s / n;
      }
    a = b;
  }
  return a;
}

describe("revisión de la foto", () => {
  it("una foto nítida y con luz pasa", () => {
    expect(revisarGris(tablero(150, 40), ANCHO, ALTO).problema).toBeNull();
  });

  it("avisa si quedó oscura", () => {
    expect(revisarGris(tablero(30, 10), ANCHO, ALTO).problema).toBe("oscura");
  });

  it("avisa si quedó borrosa", () => {
    const r = revisarGris(desenfocar(tablero(150, 40, 24)), ANCHO, ALTO);
    expect(r.problema).toBe("borrosa");
  });

  it("una foto con poca luz pero nítida no se marca como borrosa", () => {
    expect(revisarGris(tablero(70, 20), ANCHO, ALTO).problema).toBeNull();
  });
});
