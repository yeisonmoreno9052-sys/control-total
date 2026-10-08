// Código de barras (Code 128) en SVG para las etiquetas. Lo lee cualquier lector de mostrador.
import { toSVG } from "bwip-js/node";

/** El texto que va en las barras: el código de barras del producto si tiene, si no su código. */
export function textoParaBarras(p: { codigo: string; codigoBarras: string | null }) {
  return p.codigoBarras || p.codigo;
}

/** SVG del código de barras, o null si el texto tiene caracteres que no se pueden codificar. */
export function codigoBarrasSvg(texto: string): string | null {
  if (!texto || !/^[\x20-\x7e]+$/.test(texto)) return null;
  try {
    return toSVG({ bcid: "code128", text: texto, height: 10, includetext: false, paddingwidth: 0, paddingheight: 0 });
  } catch {
    return null;
  }
}
