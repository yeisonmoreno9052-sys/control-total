"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FolderInput } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { asignarCategoriaAccion } from "../acciones";

type Producto = { id: string; nombre: string; codigo: string; categoria: string | null };

/** Lista con casillas y una barra abajo: "3 marcados · Pasar a [categoría] · Cambiar". */
export function ListaCambiarCategoria({
  productos,
  categorias,
}: {
  productos: Producto[];
  categorias: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState(categorias[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const todos = productos.length > 0 && productos.every((p) => marcados.has(p.id));

  function alternar(id: string) {
    setListo(null);
    setMarcados((m) => {
      const nuevo = new Set(m);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function cambiar() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await asignarCategoriaAccion([...marcados], destino || null);
        if (!r.ok) return setError(r.error);
        const nombre = categorias.find((c) => c.id === destino)?.nombre ?? "Sin categoría";
        setListo(`${r.cambiados === 1 ? "1 producto pasó" : `${r.cambiados} productos pasaron`} a ${nombre}.`);
        setMarcados(new Set());
        router.refresh();
      } catch {
        setError("No pudimos cambiar la categoría. Revisa la conexión a internet e intenta de nuevo.");
      }
    });
  }

  return (
    <>
      {listo && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" /> {listo}
        </p>
      )}
      <ul className="divide-y rounded-xl border bg-card shadow-suave">
        <li>
          <label className="flex cursor-pointer items-center gap-3 px-4 py-3 font-medium">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={todos}
              onChange={() => setMarcados(todos ? new Set() : new Set(productos.map((p) => p.id)))}
            />
            Marcar todos los de esta página
          </label>
        </li>
        {productos.map((p) => (
          <li key={p.id}>
            <label className={cn("flex cursor-pointer items-center gap-3 px-4 py-3", marcados.has(p.id) && "bg-accent/50")}>
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-[var(--primary)]"
                checked={marcados.has(p.id)}
                onChange={() => alternar(p.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.nombre}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {p.codigo} · {p.categoria ?? "Sin categoría"}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/* Barra fija abajo, encima del menú del celular. */}
      <div className="fixed inset-x-0 bottom-[5.25rem] z-30 border-t bg-card/95 px-4 py-3 shadow-lg backdrop-blur md:bottom-0 md:left-20 lg:left-60">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center">
          <p className="font-medium sm:mr-auto">
            {marcados.size === 0 ? "Marca los productos" : marcados.size === 1 ? "1 marcado" : `${marcados.size} marcados`}
          </p>
          <div className="flex gap-2">
            <NativeSelect
              aria-label="Categoría a la que pasan"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="h-12 min-w-0 flex-1 sm:w-56"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
              <option value="">Sin categoría</option>
            </NativeSelect>
            <Button size="lg" className="h-12 shrink-0" disabled={!marcados.size || guardando} onClick={cambiar}>
              <FolderInput /> {guardando ? "Cambiando…" : "Cambiar"}
            </Button>
          </div>
        </div>
        {error && (
          <div className="mx-auto mt-2 max-w-5xl">
            <AvisoError mensaje={error} />
          </div>
        )}
      </div>
    </>
  );
}
