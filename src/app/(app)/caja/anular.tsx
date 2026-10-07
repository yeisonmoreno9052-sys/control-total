"use client";

import { useState, useTransition } from "react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Textarea } from "@/components/ui/textarea";
import { anularMovimientoAccion } from "./acciones";

export function BotonAnularMovimiento({ id, descripcion }: { id: string; descripcion: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [anulando, iniciar] = useTransition();
  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAbierto(true)}>
        Anular
      </Button>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Anular registro">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await anularMovimientoAccion(id, motivo);
              if (r.ok) setAbierto(false);
              else setError(r.error);
            });
          }}
        >
          <p className="text-muted-foreground">{descripcion}. No se borra: queda anulado, con el motivo y quién lo hizo.</p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Motivo</span>
            <Textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              placeholder="Ej.: se registró dos veces"
            />
          </label>
          <AvisoError mensaje={error ?? undefined} />
          <Button
            type="submit"
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={anulando || motivo.trim().length < 3}
          >
            {anulando ? "Anulando…" : "Anular"}
          </Button>
        </form>
      </Dialogo>
    </>
  );
}
