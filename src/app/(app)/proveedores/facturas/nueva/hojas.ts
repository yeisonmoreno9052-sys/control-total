// Prepara las fotos de la factura antes de subirlas: las achica a un tamaño que
// la IA lee bien (y que cabe como adjunto), así suben rápido aunque el internet sea lento.
const LADO_MAXIMO = 2000;
const PDF_MAXIMO = 5 * 1024 * 1024;

export async function prepararHoja(archivo: File): Promise<File> {
  if (archivo.type === "application/pdf") {
    if (archivo.size > PDF_MAXIMO) throw new Error("Foto:El PDF pesa más de 5 MB. Toma una foto de la factura en su lugar.");
    return archivo;
  }
  if (!archivo.type.startsWith("image/")) throw new Error("Foto:Solo se pueden leer fotos o PDF.");
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Foto:No pudimos abrir esa foto. Tómala de nuevo.");
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Foto:No pudimos preparar la foto.");
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("Foto:No pudimos preparar la foto.");
  const nombre = archivo.name.replace(/\.[^.]+$/, "") || "factura";
  return new File([blob], `${nombre}.jpg`, { type: "image/jpeg" });
}
