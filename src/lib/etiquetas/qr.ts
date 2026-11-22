// Código QR en SVG (para el link del catálogo en línea: cartel de la vitrina y Estados).
import { toSVG } from "bwip-js/node";

/** SVG del QR, negro sobre transparente, o null si no se pudo armar. */
export function qrSvg(texto: string): string | null {
  if (!texto || texto.length > 500) return null;
  try {
    return toSVG({ bcid: "qrcode", text: texto, scale: 4, paddingwidth: 0, paddingheight: 0 });
  } catch {
    return null;
  }
}
