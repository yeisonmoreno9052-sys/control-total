"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearCategoriaRapidaAccion } from "./acciones";

type Categoria = { id: string; nombre: string; margenSugerido: number | null };

/** Crear una categoría sin salir del formulario: queda elegida de una vez. */
export function NuevaCategoria({ onCreada }: { onCreada: (c: Categoria) => void }) {
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string>();
  const [guardando, iniciar] = useTransition();

  if (!abierta) {
    return (
      <button type="button" onClick={() => setAbierta(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <Plus className="size-4" /> Nueva categoría
      </button>
    );
  }

  const crear = () => {
    setError(undefined);
    iniciar(async () => {
      const r = await crearCategoriaRapidaAccion(nombre);
      if (!r.ok) return setError(r.error);
      onCreada(r.categoria);
      setNombre("");
      setAbierta(false);
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          autoFocus
          aria-label="Nombre de la nueva categoría"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            // Enter crea la categoría, no envía el formulario de la prenda.
            if (e.key === "Enter") {
              e.preventDefault();
              if (nombre.trim()) crear();
            }
            if (e.key === "Escape") setAbierta(false);
          }}
          placeholder="Ej.: Mujer - Pijamas"
          className="flex-1"
        />
        <Button type="button" onClick={crear} disabled={guardando || !nombre.trim()}>
          {guardando ? "Creando…" : "Crear"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierta(false)}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
