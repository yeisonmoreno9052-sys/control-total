"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESETS, type Periodo } from "@/lib/reportes/periodos";
import { cn } from "@/lib/utils";

/** Botones de periodo (hoy, esta semana, este mes…) y fechas libres. Guarda la elección en la dirección. */
export function SelectorPeriodo({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const [libre, setLibre] = useState(periodo.preset === "libre");
  const [desde, setDesde] = useState(periodo.desde);
  const [hasta, setHasta] = useState(periodo.hasta);

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(parametros.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    iniciar(() => router.push(`${ruta}?${p.toString()}`, { scroll: false }));
  };

  return (
    <div className="space-y-2" aria-busy={cargando}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periodo">
        {PRESETS.map((p) => (
          <button
            key={p.valor}
            type="button"
            aria-pressed={!libre && periodo.preset === p.valor}
            onClick={() => {
              setLibre(false);
              ir({ periodo: p.valor, desde: null, hasta: null });
            }}
            className={cn(
              "h-9 rounded-full border px-3.5 text-sm font-medium",
              !libre && periodo.preset === p.valor ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {p.nombre}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={libre}
          onClick={() => setLibre(true)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
            libre ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          <CalendarRange className="size-4" /> Fechas
        </button>
      </div>
      {libre && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (desde && hasta) ir({ periodo: null, desde, hasta });
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Desde</span>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 w-40" required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Hasta</span>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10 w-40" required />
          </label>
          <Button type="submit" disabled={cargando}>
            Ver
          </Button>
        </form>
      )}
    </div>
  );
}
