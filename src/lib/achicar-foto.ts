// Solo en el navegador: deja la foto lista para subir (cuadrada y liviana).

const LADO = 480;

/**
 * Achica la foto a un cuadrado de 480 px recortando el centro, como se ve en la caja.
 * Una foto del celular (3–5 MB) queda en unos 30 KB.
 */
export async function achicarFoto(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const lado = Math.min(imagen.width, imagen.height);
  const lienzo = document.createElement("canvas");
  lienzo.width = LADO;
  lienzo.height = LADO;
  const dibujo = lienzo.getContext("2d");
  if (!dibujo) throw new Error("sin canvas");
  dibujo.drawImage(imagen, (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  imagen.close();
  const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/webp", 0.8));
  // Safari viejo no sabe hacer WEBP y devuelve PNG (pesado): en ese caso, JPG.
  if (blob && blob.type === "image/webp") return blob;
  const jpg = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/jpeg", 0.82));
  if (!jpg) throw new Error("sin imagen");
  return jpg;
}
