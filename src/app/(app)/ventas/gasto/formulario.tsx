"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { formatearPesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { anotarGastoAccion, type EstadoAccion } from "../acciones";

export function FormularioGasto({ categorias }: { categorias: { valor: string; nombre: string }[] }) {
  const [estado, accion, guardando] = useActionState<EstadoAccion, FormData>(anotarGastoAccion, {});
  const [categoria, setCategoria] = useState(categorias[0]?.valor ?? "");
  const [valor, setValor] = useState<number | null>(null);

  if (estado.ok) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-6 text-center shadow-suave">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <p className="text-xl font-semibold">Gasto anotado</p>
        <p className="text-muted-foreground">{estado.mensaje}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="lg">
            <Link href="/ventas">Volver a la caja</Link>
          </Button>
          <Button size="lg" variant="outline" onClick={() => window.location.reload()}>
            Anotar otro
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-5 rounded-2xl border bg-card p-6 shadow-suave">
      <input type="hidden" name="categoria" value={categoria} />
      <input type="hidden" name="valor" value={valor ?? ""} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">¿Qué se pagó?</legend>
        <div className="grid grid-cols-2 gap-2">
          {categorias.map((c) => (
            <button
              key={c.valor}
              type="button"
              aria-pressed={categoria === c.valor}
              onClick={() => setCategoria(c.valor)}
              className={cn(
                "min-h-12 rounded-xl border px-3 py-2 text-left font-medium",
                categoria === c.valor ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      <Campo id="valor" etiqueta="¿Cuánto?" error={estado.campos?.valor}>
        <CampoPesos id="valor" valor={valor} onValor={setValor} className="h-14 text-2xl font-semibold" />
      </Campo>
      <Campo id="pagadoA" etiqueta="¿A quién? (opcional)">
        <Input id="pagadoA" name="pagadoA" maxLength={80} placeholder="Ej.: EPM, tienda de la esquina" />
      </Campo>
      <Campo id="nota" etiqueta="Nota (opcional)">
        <Input id="nota" name="nota" maxLength={300} placeholder="Ej.: factura de energía de octubre" />
      </Campo>
      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" className="h-14 w-full text-lg" disabled={guardando || !valor}>
        {guardando ? "Guardando…" : valor ? `Anotar gasto de ${formatearPesos(valor)}` : "Anotar gasto"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">La plata sale de la caja de hoy.</p>
    </form>
  );
}
