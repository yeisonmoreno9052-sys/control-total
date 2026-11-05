"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, HandCoins, Landmark, X } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { formatearPesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { anularAbonoAccion, registrarAbonoAccion } from "../acciones";

export function RegistrarAbono({ clienteId, debe }: { clienteId: string; debe: number }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState<number | null>(null);
  const [medio, setMedio] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string>();
  const [listo, setListo] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const cerrar = () => {
    setAbierto(false);
    setValor(null);
    setReferencia("");
    setError(undefined);
    setListo(null);
  };

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valor) return setError("Escribe cuánto abona.");
    if (valor > debe) return setError(`Solo debe ${formatearPesos(debe)}.`);
    iniciar(async () => {
      const r = await registrarAbonoAccion(clienteId, { valor, medio, referencia: referencia || null });
      if (!r.ok) return setError(r.error);
      setListo(r.debe > 0 ? `Ahora debe ${formatearPesos(r.debe)}.` : "Quedó a paz y salvo.");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="lg" className="h-14 text-lg" onClick={() => setAbierto(true)}>
        <HandCoins /> Registrar abono
      </Button>
      <Dialogo abierto={abierto} onCerrar={cerrar} titulo={listo ? undefined : "Registrar abono"}>
        {listo ? (
          <div className="space-y-5 text-center">
            <p className="text-lg font-semibold">Abono registrado</p>
            <p className="text-2xl font-bold" data-testid="nuevo-saldo">
              {listo}
            </p>
            <Button size="lg" className="h-14 w-full text-lg" onClick={cerrar} autoFocus>
              Listo
            </Button>
          </div>
        ) : (
          <form onSubmit={guardar} className="space-y-4" noValidate>
            <p className="text-muted-foreground">
              Debe <span className="font-semibold text-foreground">{formatearPesos(debe)}</span>
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">¿Cuánto abona?</span>
              <CampoPesos
                autoFocus
                valor={valor}
                onValor={(v) => {
                  setValor(v);
                  setError(undefined);
                }}
                className="h-14 text-2xl font-semibold"
                aria-label="Valor del abono"
              />
            </label>
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setValor(debe)}>
              Paga todo ({formatearPesos(debe)})
            </Button>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo paga">
              {(
                [
                  ["EFECTIVO", "Efectivo", Banknote],
                  ["TRANSFERENCIA", "Transferencia", Landmark],
                ] as const
              ).map(([m, nombre, Icono]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={medio === m}
                  onClick={() => setMedio(m)}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-medium",
                    medio === m ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
                  )}
                >
                  <Icono className="size-5" />
                  {nombre}
                </button>
              ))}
            </div>
            {medio === "TRANSFERENCIA" && (
              <Input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                maxLength={100}
                placeholder="Referencia (opcional). Ej.: Nequi 4521"
                aria-label="Referencia de la transferencia"
              />
            )}
            {medio === "EFECTIVO" && <p className="text-sm text-muted-foreground">El efectivo entra a la caja de hoy.</p>}
            <AvisoError mensaje={error} />
            <Button type="submit" size="lg" className="h-14 w-full text-lg" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar abono"}
            </Button>
          </form>
        )}
      </Dialogo>
    </>
  );
}

export function AnularAbono({ abonoId, valor }: { abonoId: string; valor: number }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Anular abono" onClick={() => setAbierto(true)}>
        <X />
      </Button>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Anular abono">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await anularAbonoAccion(abonoId, motivo);
              if (!r.ok) return setError(r.error);
              setAbierto(false);
              router.refresh();
            });
          }}
        >
          <p>
            El abono de <span className="font-semibold">{formatearPesos(valor)}</span> se anula y vuelve a la deuda. Si fue en
            efectivo, sale de la caja de hoy.
          </p>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" aria-label="Motivo" maxLength={300} autoFocus />
          <AvisoError mensaje={error} />
          <Button type="submit" variant="destructive" size="lg" className="w-full" disabled={pendiente}>
            {pendiente ? "Anulando…" : "Anular abono"}
          </Button>
        </form>
      </Dialogo>
    </>
  );
}
