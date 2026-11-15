"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { TALLAS_RAPIDAS } from "@/lib/inventario/prendas";
import { registrarLlegadaAccion } from "../../acciones";
import { CuadroCantidades, EditorOpciones, coloresRapidos } from "../../componentes";

/** Una sola pantalla: cuántas llegaron de cada talla y color, más tallas o colores nuevos. */
export function FormularioLlegada({
  prendaId,
  tallas,
  colores,
  stock,
  coloresGuardados,
}: {
  prendaId: string;
  tallas: string[];
  colores: string[];
  /** Lo que hay hoy: "M Negro: 3". */
  stock: string[];
  coloresGuardados: string[];
}) {
  const router = useRouter();
  const [nuevasTallas, setNuevasTallas] = useState<string[]>([]);
  const [nuevosColores, setNuevosColores] = useState<string[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();
  const todasTallas = [...tallas, ...nuevasTallas];
  const todosColores = [...colores, ...nuevosColores];
  const total = Object.values(cantidades).reduce((a, v) => a + (Number(v) || 0), 0);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        iniciar(async () => {
          const r = await registrarLlegadaAccion(prendaId, { tallas: todasTallas, colores: todosColores, cantidades });
          if (!r.ok) return setError(r.error);
          router.push(r.etiquetas ? `/etiqueta/prenda/${prendaId}?llegada=${encodeURIComponent(r.etiquetas)}` : `/inventario/prenda/${prendaId}`);
        });
      }}
    >
      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-suave md:p-6">
        <h2 className="font-semibold">¿Cuántas llegaron?</h2>
        <CuadroCantidades tallas={todasTallas} colores={todosColores} cantidades={cantidades} onCambiar={setCantidades} />
        {stock.length > 0 && <p className="text-sm text-muted-foreground">Hoy hay: {stock.join(" · ")}</p>}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-suave md:p-6">
        <div>
          <h2 className="font-semibold">¿Llegó una talla o un color nuevo?</h2>
          <p className="text-sm text-muted-foreground">Agrégalo aquí y aparece en el cuadro de arriba para poner la cantidad.</p>
        </div>
        <EditorOpciones
          id="talla-nueva"
          valores={nuevasTallas}
          onCambiar={setNuevasTallas}
          fijas={tallas}
          sugeridas={TALLAS_RAPIDAS.map((t) => ({ nombre: t.nombre, valores: t.tallas }))}
          placeholder="Nueva talla"
        />
        {colores.length > 0 && (
          <EditorOpciones
            id="color-nuevo"
            valores={nuevosColores}
            onCambiar={setNuevosColores}
            fijas={colores}
            sugeridas={coloresRapidos(coloresGuardados)}
            placeholder="Nuevo color"
          />
        )}
      </section>

      <AvisoError mensaje={error} />
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={guardando || (total === 0 && !nuevasTallas.length && !nuevosColores.length)}>
        <PackagePlus /> {guardando ? "Guardando…" : total > 0 ? `Guardar ${total} y ver etiquetas` : "Guardar"}
      </Button>
    </form>
  );
}
