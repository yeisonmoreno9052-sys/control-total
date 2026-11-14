"use client";

import { useEffect, useState } from "react";
import { logoBlancoYNegro } from "@/lib/etiquetas/logo-bn";
import { cn } from "@/lib/utils";

// Una sola conversión por logo, aunque la hoja tenga muchas etiquetas.
const convertidos = new Map<string, Promise<string | null>>();

function convertir(url: string) {
  return new Promise<string | null>((listo) => {
    const img = new Image();
    img.onload = () => {
      try {
        // 9 mm a 203 ppp son unos 72 puntos: 160 alcanza para que salga nítido.
        const lado = 160;
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
export function LogoEtiqueta({ url, className }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!convertidos.has(url)) convertidos.set(url, convertir(url));
    convertidos.get(url)!.then((s) => vivo && setSrc(s ?? url));
    return () => {
      vivo = false;
    };
  }, [url]);
  if (!src) return <span className={cn("etiqueta-logo shrink-0", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={cn("etiqueta-logo shrink-0 object-contain", className)} />;
}
