"use client";

import { useActionState, useState } from "react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatearCantidad, leerCantidad } from "@/lib/inventario/cantidades";
import { MOTIVOS_AJUSTE } from "@/lib/inventario/unidades";
import { cn } from "@/lib/utils";
import { guardarAjuste, type EstadoFormulario } from "../../acciones";

export function FormularioAjuste({
  productoId,
  stockActual,
  unidad,
  fraccionado,
}: {
  productoId: string;
  stockActual: string;
  unidad: string;
  fraccionado: boolean;
}) {
  const [estado, accion, guardando] = useActionState<EstadoFormulario, FormData>(guardarAjuste, {});
  const [modo, setModo] = useState<"nuevo" | "diferencia">("nuevo");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("CONTEO");
  const e = estado.campos ?? {};

  const valor = leerCantidad(cantidad);
  const resultado = valor ? (modo === "nuevo" ? valor : valor.plus(stockActual)) : null;

  return (
    <form action={accion} className="space-y-6">
      <input type="hidden" name="productoId" value={productoId} />
      <input type="hidden" name="modo" value={modo} />

      <p className="rounded-xl bg-muted p-4">
        Stock actual: <strong className="tabular-nums">{formatearCantidad(stockActual)} {unidad}</strong>
      </p>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Tipo de ajuste">
        {(
          [
            ["nuevo", "Contar el stock"],
            ["diferencia", "Sumar o restar"],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={modo === v}
            onClick={() => setModo(v)}
            className={cn("h-10 rounded-md text-sm font-medium", modo === v ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {t}
          </button>
        ))}
      </div>

      <Campo
        id="cantidad"
        etiqueta={modo === "nuevo" ? "¿Cuánto hay?" : "Cantidad a sumar (usa − para restar)"}
        error={e.cantidad}
        ayuda={
          resultado && !resultado.isNegative()
            ? `Quedará en ${formatearCantidad(resultado.toString())} ${unidad}`
            : fraccionado
              ? "Puedes usar decimales: 2,5"
              : undefined
        }
      >
        <Input
          id="cantidad"
          name="cantidad"
          inputMode={modo === "nuevo" ? "decimal" : "text"}
          value={cantidad}
          onChange={(ev) => setCantidad(ev.target.value)}
          placeholder={modo === "nuevo" ? "0" : "-3"}
          autoFocus
          required
          className="h-12 text-lg"
          aria-invalid={!!e.cantidad}
        />
      </Campo>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Motivo</legend>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(MOTIVOS_AJUSTE).map(([v, t]) => (
            <label
              key={v}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium",
                motivo === v && "border-primary bg-accent text-accent-foreground",
              )}
            >
              <input type="radio" name="motivo" value={v} checked={motivo === v} onChange={() => setMotivo(v)} className="sr-only" />
              {t}
            </label>
          ))}
        </div>
        {e.motivo && <p className="text-sm text-destructive">{e.motivo}</p>}
      </fieldset>

      <Campo id="nota" etiqueta={motivo === "OTRO" ? "Nota (obligatoria)" : "Nota (opcional)"} error={e.nota}>
        <Textarea id="nota" name="nota" rows={2} required={motivo === "OTRO"} aria-invalid={!!e.nota} />
      </Campo>

      <AvisoError mensaje={estado.error} />

      <Button type="submit" size="lg" className="w-full" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar ajuste"}
      </Button>
    </form>
  );
}
