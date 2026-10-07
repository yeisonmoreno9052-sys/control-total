"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Barra de arriba (no sale en la impresión). Con ?imprimir=1 abre el diálogo de impresión solo. */
export function BarraRecibo({ imprimir, volver }: { imprimir: boolean; volver: string }) {
  useEffect(() => {
    if (!imprimir) return;
    // Espera a que cargue el logo para que salga en el papel.
    const imagenes = Array.from(document.images).filter((i) => !i.complete);
    const cargadas = imagenes.map(
      (i) =>
        new Promise((listo) => {
          i.addEventListener("load", listo, { once: true });
          i.addEventListener("error", listo, { once: true });
        }),
    );
    Promise.all(cargadas).then(() => window.print());
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
