// Solo en el navegador: deja la foto lista para subir (cuadrada y liviana).

const LADO = 480;
/** El servidor no recibe fotos de más de 200 KB (FOTO_MAXIMO). */
const PESO_MAXIMO = 190 * 1024;

/**
 * Achica la foto a un cuadrado recortando el centro, como se ve en la caja.
 * Con 480 px una foto del celular (3–5 MB) queda en unos 30 KB. Para los Estados de
 * WhatsApp se pide más grande (900 px, unos 100–150 KB) para que no se vea borrosa.
 */
export async function achicarFoto(archivo: File, salida = LADO): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const lado = Math.min(imagen.width, imagen.height);
  const lienzo = document.createElement("canvas");
  lienzo.width = salida;
  lienzo.height = salida;
  const dibujo = lienzo.getContext("2d");
  if (!dibujo) throw new Error("sin canvas");
  dibujo.drawImage(imagen, (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado, 0, 0, salida, salida);
  imagen.close();
  // Si queda pesada (fotos con mucho detalle), se baja la calidad hasta que quepa.
  let ultima: Blob | null = null;
  for (const calidad of [0.8, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/webp", calidad));
    // Safari viejo no sabe hacer WEBP y devuelve PNG (pesado): en ese caso, JPG.
    const final =
      blob && blob.type === "image/webp"
        ? blob
        : await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/jpeg", calidad + 0.02));
    if (!final) throw new Error("sin imagen");
    ultima = final;
    if (final.size <= PESO_MAXIMO) break;
  }
  return ultima!;
}
