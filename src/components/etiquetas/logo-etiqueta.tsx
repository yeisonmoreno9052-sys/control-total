"use client";

import { useEffect, useState } from "react";
import { logoBlancoYNegro } from "@/lib/etiquetas/logo-bn";
import { cn } from "@/lib/utils";

// Una sola conversión por logo, aunque la hoja tenga muchas etiquetas.
const convertidos = new Map<string, Promise<string | null>>();

function convertir(url: string, lado: number) {
  return new Promise<string | null>((listo) => {
    const img = new Image();
    img.onload = () => {
      try {
        const lienzo = document.createElement("canvas");
        lienzo.width = lienzo.height = lado;
        const c = lienzo.getContext("2d")!;
        const escala = Math.min(lado / img.width, lado / img.height);
        const w = img.width * escala;
        const h = img.height * escala;
        c.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
        const datos = c.getImageData(0, 0, lado, lado);
        logoBlancoYNegro(datos.data);
        c.putImageData(datos, 0, 0);
        listo(lienzo.toDataURL("image/png"));
      } catch {
        listo(null);
      }
    };
    img.onerror = () => listo(null);
    img.src = url;
  });
}

/** Logo de la tienda en blanco y negro puro, como lo imprime la impresora térmica. */
// `lado` es la resolución del lienzo: 9 mm a 203 ppp son unos 72 puntos, así que 160 alcanza para una
// etiqueta; para el recibo, con el logo más grande, se usa más.
export function LogoEtiqueta({ url, className, lado = 160 }: { url: string; className?: string; lado?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    const clave = `${lado}|${url}`;
    if (!convertidos.has(clave)) convertidos.set(clave, convertir(url, lado));
    convertidos.get(clave)!.then((s) => vivo && setSrc(s ?? url));
    return () => {
      vivo = false;
    };
  }, [url, lado]);
  // data-logo-pendiente: el recibo espera a que desaparezca antes de abrir la impresión.
  if (!src) return <span data-logo-pendiente className={cn("etiqueta-logo shrink-0", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={cn("etiqueta-logo shrink-0 object-contain", className)} />;
}
