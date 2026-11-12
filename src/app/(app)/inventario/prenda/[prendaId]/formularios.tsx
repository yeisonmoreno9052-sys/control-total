"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leerPesos } from "@/lib/inventario/esquemas";
import { TALLAS_RAPIDAS } from "@/lib/inventario/prendas";
import { agregarVariantesAccion, cambiarPrecioPrendaAccion } from "../acciones";
import { COLORES_RAPIDOS, CuadroCantidades, EditorOpciones } from "../componentes";

const pesosATexto = (n: number) => (n ? new Intl.NumberFormat("es-CO").format(n) : "");

export function CambiarPrecio({ prendaId, precio }: { prendaId: string; precio: number }) {
  const router = useRouter();
  const [valor, setValor] = useState(pesosATexto(precio));
  const [error, setError] = useState<string>();
  const [listo, setListo] = useState(false);
  const [guardando, iniciar] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        setListo(false);
        iniciar(async () => {
          const r = await cambiarPrecioPrendaAccion(prendaId, valor);
          if (!r.ok) return setError(r.error);
          setListo(true);
          router.refresh();
        });
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Nuevo precio de venta"
          inputMode="numeric"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => setValor(pesosATexto(leerPesos(valor) ?? 0))}
          placeholder="Ej.: 45.000"
          className="max-w-48"
        />
        <Button type="submit" disabled={guardando || !valor}>
          {guardando ? "Guardando…" : "Cambiar a todas"}
        </Button>
      </div>
      <AvisoError mensaje={error} />
      {listo && <p className="text-sm text-emerald-600">Precio cambiado en todas las tallas.</p>}
    </form>
  );
}

export function AgregarTallas({
  prendaId,
  tallas,
  colores,
  existentes,
}: {
  prendaId: string;
  tallas: string[];
  colores: string[];
  existentes: string[];
}) {
  const router = useRouter();
  const [nuevasTallas, setNuevasTallas] = useState<string[]>([]);
  const [nuevosColores, setNuevosColores] = useState<string[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();
  const todasTallas = [...tallas, ...nuevasTallas];
  const todosColores = [...colores, ...nuevosColores];
  const hayNuevas = nuevasTallas.length > 0 || nuevosColores.length > 0;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        iniciar(async () => {
          const r = await agregarVariantesAccion(prendaId, { tallas: todasTallas, colores: todosColores, cantidades });
          if (!r.ok) return setError(r.error);
          setNuevasTallas([]);
          setNuevosColores([]);
          setCantidades({});
          router.push(`/inventario/prenda/${prendaId}?agregada=1`);
          router.refresh();
        });
      }}
    >
      <div className="space-y-2">
        <p className="text-sm font-medium">Tallas</p>
        <EditorOpciones
          id="nueva-talla"
          fijas={tallas}
          valores={nuevasTallas}
          onCambiar={setNuevasTallas}
          sugeridas={TALLAS_RAPIDAS.map((t) => ({ nombre: t.nombre, valores: t.tallas }))}
          placeholder="Nueva talla"
        />
      </div>
      {colores.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Colores</p>
          <EditorOpciones
            id="nuevo-color"
            fijas={colores}
            valores={nuevosColores}
            onCambiar={setNuevosColores}
            sugeridas={COLORES_RAPIDOS}
            placeholder="Nuevo color"
          />
        </div>
      )}
      {hayNuevas && (
        <CuadroCantidades
          tallas={todasTallas}
          colores={todosColores}
          cantidades={cantidades}
          onCambiar={setCantidades}
          existentes={new Set(existentes)}
        />
      )}
      <AvisoError mensaje={error} />
      <Button type="submit" disabled={guardando || !hayNuevas}>
        {guardando ? "Agregando…" : "Agregar"}
      </Button>
    </form>
  );
}
