// Solo en el navegador: deja la foto lista para subir (liviana).

const LADO = 1000;
/** El servidor no recibe fotos de más de 200 KB (FOTO_MAXIMO). */
const PESO_MAXIMO = 190 * 1024;

/**
 * Achica la foto antes de subirla. Por defecto conserva la forma de la foto
 * (vertical u horizontal, sin recortar) y el lado largo mide hasta `salida` px: la
 * misma foto sirve para la caja (allí se muestra recortada al cuadro) y para los
 * Estados de WhatsApp, donde la prenda debe verse completa.
 * Con `{ completa: false }` sale un cuadrado recortando el centro.
 * Si queda pesada (fotos con mucho detalle o brillos), baja la calidad y luego el
 * tamaño hasta que quepa: nunca se rechaza una foto por pesada.
 */
export async function achicarFoto(archivo: File, salida = LADO, opciones: { completa?: boolean } = { completa: true }): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  try {
    let ultima: Blob | null = null;
    for (const escala of [1, 0.8, 0.65, 0.5]) {
      const lienzo = dibujar(imagen, Math.round(salida * escala), opciones.completa !== false);
      for (const calidad of [0.82, 0.7, 0.58]) {
        ultima = await aBlob(lienzo, calidad);
        if (ultima.size <= PESO_MAXIMO) return ultima;
      }
    }
    return ultima!;
  } finally {
    imagen.close();
  }
}

function dibujar(imagen: ImageBitmap, lado: number, completa: boolean) {
  const lienzo = document.createElement("canvas");
  const dibujo = lienzo.getContext("2d");
  if (!dibujo) throw new Error("sin canvas");
  if (completa) {
    const e = Math.min(1, lado / Math.max(imagen.width, imagen.height));
    lienzo.width = Math.max(1, Math.round(imagen.width * e));
    lienzo.height = Math.max(1, Math.round(imagen.height * e));
    dibujo.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  } else {
    const corte = Math.min(imagen.width, imagen.height);
    lienzo.width = lado;
    lienzo.height = lado;
    dibujo.drawImage(imagen, (imagen.width - corte) / 2, (imagen.height - corte) / 2, corte, corte, 0, 0, lado, lado);
  }
  return lienzo;
}

async function aBlob(lienzo: HTMLCanvasElement, calidad: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/webp", calidad));
  // Safari (iPhone) no sabe hacer WEBP y devuelve PNG (pesado): en ese caso, JPG.
  const final =
    blob && blob.type === "image/webp"
      ? blob
      : await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/jpeg", calidad));
  if (!final) throw new Error("sin imagen");
  return final;
}
