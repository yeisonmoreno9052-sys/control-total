"use client";

import { cn } from "@/lib/utils";
import { TAMANOS_ETIQUETA, type TamanoEtiqueta } from "./etiqueta";

/** Escoger el tamaño del rollo de etiquetas. No sale en la impresión. */
export function SelectorTamano({ tamano, onCambiar }: { tamano: TamanoEtiqueta; onCambiar: (t: TamanoEtiqueta) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" role="radiogroup" aria-label="Tamaño de la etiqueta">
      <span className="text-sm text-muted-foreground">Tamaño del rollo:</span>
      {(Object.keys(TAMANOS_ETIQUETA) as TamanoEtiqueta[]).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={tamano === t}
          onClick={() => onCambiar(t)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm",
            tamano === t ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card hover:border-primary",
          )}
        >
          {TAMANOS_ETIQUETA[t].nombre}
        </button>
      ))}
    </div>
  );
}
