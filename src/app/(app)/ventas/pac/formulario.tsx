"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { formatearPesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { registrarPacAccion, type EstadoPac } from "./acciones";

const COMISIONES = [1000, 2000, 3000];

const opcion = (activa: boolean) =>
  cn(
    "min-h-14 rounded-xl border-2 px-3 py-2 text-lg font-semibold transition-colors",
    activa ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted",
  );

/** Anotar una recarga o un retiro del PAC: tipo, valor, comisión y (en recargas) cómo pagó el cliente. */
export function FormularioPac() {
  const [estado, accion, guardando] = useActionState<EstadoPac, FormData>(registrarPacAccion, {});
  const [tipo, setTipo] = useState<"RECARGA" | "RETIRO">("RECARGA");
  const [medio, setMedio] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [valor, setValor] = useState<number | null>(null);
  const [comision, setComision] = useState<number | null>(null);
  const [otra, setOtra] = useState(false);
  const [nota, setNota] = useState("");

  // Al guardar, el formulario queda listo para la siguiente.
  const [vez, setVez] = useState(estado.vez);
  if (estado.vez !== vez) {
    setVez(estado.vez);
    setValor(null);
    setComision(null);
    setOtra(false);
    setNota("");
  }

  const c = comision ?? 0;
  const listo = !!valor && valor > 0 && comision !== null && c < valor;
  let resumen: React.ReactNode = null;
  if (valor) {
    resumen =
      tipo === "RETIRO" ? (
        <>
          Entréguele al cliente <b>{formatearPesos(Math.max(valor - c, 0))}</b> en efectivo.
        </>
      ) : medio === "EFECTIVO" ? (
        <>
          El cliente le entrega <b>{formatearPesos(valor + c)}</b> en efectivo.
        </>
      ) : (
        <>
          El cliente le transfiere <b>{formatearPesos(valor + c)}</b>.
        </>
      );
  }

  return (
    <form action={accion} className="space-y-5 rounded-2xl border bg-card p-5 shadow-suave sm:p-6">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="medio" value={tipo === "RETIRO" ? "EFECTIVO" : medio} />
      <input type="hidden" name="valor" value={valor ?? ""} />
      <input type="hidden" name="comision" value={comision ?? ""} />

      <fieldset>
        <legend className="mb-2 font-semibold">¿Qué hizo?</legend>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={tipo === "RECARGA"} onClick={() => setTipo("RECARGA")} className={opcion(tipo === "RECARGA")}>
            Recarga
          </button>
          <button type="button" aria-pressed={tipo === "RETIRO"} onClick={() => setTipo("RETIRO")} className={opcion(tipo === "RETIRO")}>
            Retiro
          </button>
        </div>
      </fieldset>

      <Campo id="valor-pac" etiqueta="Valor" error={estado.campos?.valor}>
        <CampoPesos id="valor-pac" valor={valor} onValor={setValor} className="h-14 text-2xl font-bold" />
      </Campo>

      <fieldset>
        <legend className="mb-2 font-semibold">Comisión que ganó</legend>
        <div className="grid grid-cols-4 gap-2">
          {COMISIONES.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={!otra && comision === v}
              onClick={() => {
                setOtra(false);
                setComision(v);
              }}
              className={cn(
                "min-h-14 rounded-xl border-2 px-1 text-base font-bold tabular-nums sm:text-lg",
                !otra && comision === v ? "border-emerald-600 bg-emerald-600 text-white" : "bg-card hover:bg-muted",
              )}
            >
              {formatearPesos(v)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={otra}
            onClick={() => {
              setOtra(true);
              setComision(null);
            }}
            className={cn(
              "min-h-14 rounded-xl border-2 px-1 text-base font-bold sm:text-lg",
              otra ? "border-emerald-600 bg-emerald-600 text-white" : "bg-card hover:bg-muted",
            )}
          >
            Otra
          </button>
        </div>
        {otra && (
          <CampoPesos
            aria-label="Otra comisión"
            autoFocus
            valor={comision}
            onValor={setComision}
            placeholder="0"
            className="mt-2 h-12 text-xl font-semibold"
          />
        )}
        {estado.campos?.comision && <p className="mt-1 text-sm text-destructive">{estado.campos.comision}</p>}
      </fieldset>

      {tipo === "RECARGA" && (
        <fieldset>
          <legend className="mb-2 font-semibold">El cliente pagó con</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={medio === "EFECTIVO"} onClick={() => setMedio("EFECTIVO")} className={opcion(medio === "EFECTIVO")}>
              Efectivo
            </button>
            <button
              type="button"
              aria-pressed={medio === "TRANSFERENCIA"}
              onClick={() => setMedio("TRANSFERENCIA")}
              className={opcion(medio === "TRANSFERENCIA")}
            >
              Transferencia
            </button>
          </div>
        </fieldset>
      )}

      <Input
        name="nota"
        aria-label="Nota"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        maxLength={200}
        placeholder="Nota (opcional): Nequi 300 123…"
        className="h-12"
      />

      {resumen && (
        <p className="rounded-xl bg-accent px-4 py-3 text-accent-foreground">
          {resumen}
          {comision !== null && (
            <>
              <br />
              Su ganancia: <b>{formatearPesos(c)}</b>.
            </>
          )}
        </p>
      )}

      {estado.ok && estado.mensaje && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" /> {estado.mensaje}
        </p>
      )}
      <AvisoError mensaje={estado.ok ? undefined : estado.error} />

      <Button type="submit" size="lg" className="h-14 w-full text-lg" disabled={guardando || !listo}>
        {guardando ? "Guardando…" : comision === null && valor ? "Elige la comisión" : "Guardar"}
      </Button>
    </form>
  );
}
