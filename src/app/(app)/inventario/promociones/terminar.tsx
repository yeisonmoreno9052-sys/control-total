"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { terminarPromocionAccion } from "./acciones";

/** Termina una promoción antes de tiempo: las prendas vuelven a su precio normal. */
export function TerminarPromocion({ id, nombre }: { id: string; nombre: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirmar)
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirmar(true)}>
        Terminar
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">¿Terminar «{nombre}» ya?</span>
      <Button
        size="sm"
        variant="destructive"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await terminarPromocionAccion(id);
            if (!r.ok) setError(r.error ?? "No se pudo terminar.");
          })
        }
      >
        Sí, terminar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
        No
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
