// Revisa si una foto quedó oscura o borrosa antes de guardarla. Son cuentas sobre los
// píxeles en gris (sin navegador), así se prueban solas.
//
// Los límites salen de medir fotos reales tomadas con celular en la tienda: una foto
// nítida da más de 300 de nitidez; la misma foto movida da menos de 50.

/** Brillo promedio (0 a 255) por debajo del cual la foto se ve oscura. */
export const BRILLO_MINIMO = 55;
/** Nitidez (varianza del laplaciano, ajustada por brillo) por debajo de la cual se ve borrosa. */
export const NITIDEZ_MINIMA = 50;

export type Revision = { brillo: number; nitidez: number; problema: "oscura" | "borrosa" | null };

/** Gris (0 a 255) de cada píxel RGBA. */
export function aGris(rgba: Uint8ClampedArray | Uint8Array, ancho: number, alto: number) {
  const gris = new Float32Array(ancho * alto);
  for (let i = 0; i < gris.length; i++) gris[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return gris;
}

/** Brillo y nitidez de una imagen en gris (pensado para unos 256 px de ancho). */
export function revisarGris(gris: Float32Array, ancho: number, alto: number): Revision {
  let suma = 0;
  for (const g of gris) suma += g;
  const brillo = gris.length ? suma / gris.length : 0;

  let n = 0;
  let s = 0;
  let s2 = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const l = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - ancho] - gris[i + ancho];
      s += l;
      s2 += l * l;
      n++;
    }
  }
  const varianza = n ? s2 / n - (s / n) ** 2 : 0;
  // Una foto oscura tiene menos contraste aunque esté nítida: se compensa por el brillo.
  const nitidez = varianza * (128 / Math.max(brillo, 20)) ** 2;

  const problema = brillo < BRILLO_MINIMO ? "oscura" : nitidez < NITIDEZ_MINIMA ? "borrosa" : null;
  return { brillo: Math.round(brillo), nitidez: Math.round(nitidez), problema };
}

export const CONSEJOS: Record<NonNullable<Revision["problema"]>, { titulo: string; texto: string }> = {
  oscura: { titulo: "La foto quedó oscura", texto: "Prende la luz o acerca la prenda a una ventana y tómala otra vez." },
  borrosa: { titulo: "La foto quedó borrosa", texto: "Quédate quieta un segundo al tomarla y toca la pantalla sobre la prenda para enfocar." },
};
