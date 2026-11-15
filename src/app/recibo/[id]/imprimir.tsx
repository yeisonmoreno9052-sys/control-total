"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Barra de arriba (no sale en la impresión). Con ?imprimir=1 abre el diálogo de impresión solo. */
export function BarraRecibo({ imprimir, volver }: { imprimir: boolean; volver: string }) {
  useEffect(() => {
    if (!imprimir) return;
    let cancelado = false;
    // Espera a que el logo esté convertido a blanco y negro (máximo 3 segundos) y cargado.
    const inicio = Date.now();
    const esperar = () => {
      if (cancelado) return;
      if (document.querySelector("[data-logo-pendiente]") && Date.now() - inicio < 3000) {
        setTimeout(esperar, 50);
        return;
      }
      const cargadas = Array.from(document.images)
        .filter((i) => !i.complete)
        .map(
          (i) =>
            new Promise((listo) => {
              i.addEventListener("load", listo, { once: true });
              i.addEventListener("error", listo, { once: true });
            }),
        );
      Promise.all(cargadas).then(() => !cancelado && window.print());
    };
    esperar();
    return () => {
      cancelado = true;
    };
  }, [imprimir]);

  return (
    <div className="mx-auto mb-4 flex max-w-[80mm] items-center justify-between gap-2 print:hidden">
      <Button asChild variant="ghost" size="sm">
        <Link href={volver}>
          <ArrowLeft /> Volver
        </Link>
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Imprimir o guardar PDF
      </Button>
    </div>
  );
}
