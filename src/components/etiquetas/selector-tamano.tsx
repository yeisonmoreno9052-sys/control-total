"use client";

import { useEffect, useState } from "react";
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

const CLAVE_PRECIO = "ct-etiqueta-sin-precio";

/** Lo último que se escogió en este equipo (con o sin precio). Sin acceso al almacenamiento: con precio. */
export function sinPrecioGuardado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_PRECIO) === "1";
  } catch {
    return false;
  }
}

function guardarSinPrecio(sin: boolean) {
  try {
    if (sin) window.localStorage.setItem(CLAVE_PRECIO, "1");
    else window.localStorage.removeItem(CLAVE_PRECIO);
  } catch {
    // Sin almacenamiento: solo no se recuerda.
  }
}

/** Con o sin precio en la etiqueta (algunas tiendas de ropa no lo muestran). Se recuerda en el equipo. */
export function SelectorPrecio({ sinPrecio, onCambiar }: { sinPrecio: boolean; onCambiar: (sin: boolean) => void }) {
  const opciones = [
    { sin: false, nombre: "Con precio" },
    { sin: true, nombre: "Sin precio" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" role="radiogroup" aria-label="Precio en la etiqueta">
      <span className="text-sm text-muted-foreground">Precio en la etiqueta:</span>
      {opciones.map((o) => (
        <button
          key={o.nombre}
          type="button"
          role="radio"
          aria-checked={sinPrecio === o.sin}
          onClick={() => {
            guardarSinPrecio(o.sin);
            onCambiar(o.sin);
          }}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm",
            sinPrecio === o.sin ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card hover:border-primary",
          )}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  );
}

/** Estado "sin precio" que arranca con lo recordado en el equipo. */
export function useSinPrecio(): [boolean, (sin: boolean) => void] {
  const [sin, setSin] = useState(false);
  useEffect(() => {
    // Se lee después de montar para que el servidor y el navegador pinten lo mismo primero.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sinPrecioGuardado()) setSin(true);
  }, []);
  return [sin, setSin];
}
