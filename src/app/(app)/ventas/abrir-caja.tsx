"use client";

import { useActionState, useState, useTransition } from "react";
import { LockOpen } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { abrirCajaAccion, reabrirCajaAccion, type EstadoAccion } from "./acciones";

/** Primera acción del día: escribir con cuánto efectivo arranca la caja. */
export function AbrirCaja() {
  const [estado, accion, abriendo] = useActionState<EstadoAccion, FormData>(abrirCajaAccion, {});
  const [base, setBase] = useState<number | null>(null);
  return (
    <form action={accion} className="mx-auto max-w-sm space-y-4 rounded-2xl border bg-card p-6 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <LockOpen className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Abrir la caja de hoy</h2>
        <p className="text-sm text-muted-foreground">Cuenta el efectivo con el que empiezas (la base) y escríbelo aquí.</p>
      </div>
      <input type="hidden" name="base" value={base ?? 0} />
      <CampoPesos
        autoFocus
        valor={base}
        onValor={setBase}
        placeholder="0"
        aria-label="Base de la caja"
        className="h-14 text-center text-2xl font-semibold"
      />
      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" className="h-14 w-full text-lg" disabled={abriendo}>
        {abriendo ? "Abriendo…" : "Abrir caja"}
      </Button>
    </form>
  );
}

export function BotonReabrir({ cajaId }: { cajaId: string }) {
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await reabrirCajaAccion(cajaId);
            setError(r.error);
          })
        }
      >
        {pendiente ? "Abriendo…" : "Volver a abrir la caja"}
      </Button>
      <AvisoError mensaje={error} />
    </div>
  );
}
