"use client";

import {
  guardarPreferenciaTeclado,
  usePreferenciaTeclado,
  useTecladoActivo,
  type PreferenciaTeclado,
} from "@/components/ventas/teclado-numerico";
import { cn } from "@/lib/utils";

const OPCIONES: { valor: PreferenciaTeclado; nombre: string }[] = [
  { valor: "auto", nombre: "Automático" },
  { valor: "si", nombre: "Siempre" },
  { valor: "no", nombre: "Nunca" },
];

/** Teclado numérico en pantalla para la caja. Se guarda en este equipo, no en la cuenta. */
export function PreferenciaTeclado() {
  const preferencia = usePreferenciaTeclado();
  const activo = useTecladoActivo();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Teclado en pantalla">
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={preferencia === o.valor}
            onClick={() => guardarPreferenciaTeclado(o.valor)}
            className={cn(
              "h-12 rounded-lg border font-medium",
              preferencia === o.valor ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
            )}
          >
            {o.nombre}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {activo ? "En este equipo la caja muestra el teclado." : "En este equipo la caja no muestra el teclado."} Automático lo
        muestra en computadores táctiles y tabletas, no en el celular.
      </p>
    </div>
  );
}
