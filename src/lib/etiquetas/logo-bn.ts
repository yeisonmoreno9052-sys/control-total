// Logo para la impresora de etiquetas, que solo imprime negro sobre blanco.
// Aquí solo hay cálculos (sin navegador) para poder probarlos.

const luz = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Pasa los píxeles (RGBA) a blanco y negro puro, sin grises.
 * Si el logo es oscuro (fondo negro con letras doradas, como el de DB Shop) se invierte:
 * el fondo queda blanco y las letras negras. Si no, el fondo oscuro saldría como una mancha.
 * Lo transparente queda blanco.
 */
export function logoBlancoYNegro(px: Uint8ClampedArray) {
  let suma = 0;
  let opacos = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    suma += luz(px[i], px[i + 1], px[i + 2]);
    opacos++;
  }
  const oscuro = opacos > 0 && suma / opacos < 128;
  for (let i = 0; i < px.length; i += 4) {
    const l = luz(px[i], px[i + 1], px[i + 2]);
    const tinta = px[i + 3] >= 128 && (oscuro ? l > 70 : l < 180);
    const v = tinta ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  return { invertido: oscuro };
}
