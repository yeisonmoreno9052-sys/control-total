"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Printer } from "lucide-react";
import { Etiqueta, EstiloRollo, type TamanoEtiqueta } from "@/components/etiquetas/etiqueta";
import { SelectorTamano } from "@/components/etiquetas/selector-tamano";
import { Button } from "@/components/ui/button";

type Variante = { id: string; talla: string; color: string | null; precio: number; texto: string; svg: string | null; stock: number };

const MAXIMO = 500;

/** Cuántas etiquetas de cada talla y color (por defecto, una por pieza en stock) e imprimir. */
export function HojaPrenda({
  prendaId,
  nombre,
  variantes,
  nueva,
}: {
  prendaId: string;
  nombre: string;
  variantes: Variante[];
  nueva: boolean;
}) {
  const [copias, setCopias] = useState<Record<string, number>>(() => Object.fromEntries(variantes.map((v) => [v.id, v.stock])));
  const [tamano, setTamano] = useState<TamanoEtiqueta>("50x25");
  const total = variantes.reduce((a, v) => a + (copias[v.id] ?? 0), 0);
  const cambiar = (id: string, n: number) => setCopias((c) => ({ ...c, [id]: Math.max(0, Math.min(99, n)) }));

  return (
    <>
      <div className="mx-auto mb-6 max-w-3xl space-y-4 print:hidden">
        {nueva && (
          <p role="status" className="rounded-md bg-accent px-3 py-2 text-accent-foreground">
            <strong>{nombre}</strong> quedó guardada. Imprime las etiquetas y pégale a cada prenda la suya.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost">
            <Link href={`/inventario/prenda/${prendaId}`}>
              <ArrowLeft /> Ver la prenda
            </Link>
          </Button>
          <Button size="lg" onClick={() => window.print()} disabled={total === 0 || total > MAXIMO}>
            <Printer /> Imprimir {total} {total === 1 ? "etiqueta" : "etiquetas"}
          </Button>
        </div>
        <SelectorTamano tamano={tamano} onCambiar={setTamano} />
        <div className="rounded-xl border bg-card shadow-suave">
          <p className="border-b px-4 py-3 text-sm text-muted-foreground">
            Cuántas etiquetas de cada una. Ya vienen con lo que hay en stock.
          </p>
          <ul className="divide-y">
            {variantes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0">
                  <span className="font-semibold">{v.talla}</span>
                  {v.color && <span className="text-muted-foreground"> · {v.color}</span>}
                  <span className="block text-xs text-muted-foreground">{v.texto}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label={`Una menos de ${v.talla}`} onClick={() => cambiar(v.id, (copias[v.id] ?? 0) - 1)}>
                    <Minus />
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">{copias[v.id] ?? 0}</span>
                  <Button variant="outline" size="icon" aria-label={`Una más de ${v.talla}`} onClick={() => cambiar(v.id, (copias[v.id] ?? 0) + 1)}>
                    <Plus />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {total > MAXIMO && <p className="text-sm text-destructive">Máximo {MAXIMO} etiquetas de una vez.</p>}
      </div>
      <EstiloRollo tamano={tamano} />
      <div className="rollo-etiquetas mx-auto flex max-w-3xl flex-wrap justify-center gap-[3mm]">
        {total <= MAXIMO &&
          variantes.flatMap((v) =>
            Array.from({ length: copias[v.id] ?? 0 }, (_, i) => (
              <Etiqueta
                key={`${v.id}-${i}`}
                nombre={nombre}
                talla={v.talla}
                color={v.color}
                texto={v.texto}
                svg={v.svg}
                precio={v.precio}
                tamano={tamano}
              />
            )),
          )}
      </div>
    </>
  );
}
