"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Barra de arriba (no sale en el papel). Con ?imprimir=1 abre el diálogo de impresión solo. */
export function BarraImpresion({ imprimir }: { imprimir: boolean }) {
  useEffect(() => {
    if (!imprimir) return;
    const pendientes = Array.from(document.images)
      .filter((i) => !i.complete)
      .map((i) => new Promise((listo) => ["load", "error"].forEach((ev) => i.addEventListener(ev, listo, { once: true }))));
    Promise.all(pendientes).then(() => window.print());
  }, [imprimir]);

  return (
    <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-2 print:hidden">
      <p className="text-sm text-muted-foreground">Para PDF, en el destino elige &quot;Guardar como PDF&quot;.</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => window.close()}>
          <X /> Cerrar
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Imprimir o guardar PDF
        </Button>
      </div>
    </div>
  );
}
