"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoriaVista } from "@/lib/datos/categorias";
import { guardarCategoriaAccion, guardarMargenAccion, type EstadoFormulario } from "../acciones";

function Porcentaje(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Input inputMode="decimal" className="pr-8" {...props} />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>
    </div>
  );
}

export function FormularioMargen({ margen }: { margen: number }) {
  const [estado, accion, guardando] = useActionState<EstadoFormulario, FormData>(guardarMargenAccion, {});
  return (
    <form action={accion} className="flex flex-wrap items-start gap-3">
      <div className="w-32">
        <Porcentaje name="margen" defaultValue={String(margen).replace(".", ",")} aria-label="Margen del negocio" aria-invalid={!!estado.campos?.margen} />
      </div>
      <Button type="submit" variant="outline" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar margen"}
      </Button>
      {estado.ok && <span className="self-center text-sm text-muted-foreground">Guardado.</span>}
      {estado.campos?.margen && <p className="w-full text-sm text-destructive">{estado.campos.margen}</p>}
    </form>
  );
}

export function NuevaCategoria() {
  const [estado, accion, guardando] = useActionState<EstadoFormulario, FormData>(guardarCategoriaAccion, {});
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) formulario.current?.reset();
  }, [estado]);

  return (
    <form ref={formulario} action={accion} className="flex flex-wrap items-start gap-3 rounded-xl border border-dashed p-3">
      <Input name="nombre" placeholder="Nueva categoría" aria-label="Nombre de la categoría" className="min-w-40 flex-1" aria-invalid={!!estado.campos?.nombre} />
      <div className="w-28">
        <Porcentaje name="margenSugerido" placeholder="Margen" aria-label="Margen de la categoría (opcional)" />
      </div>
      <Button type="submit" disabled={guardando}>
        Agregar
      </Button>
      {(estado.campos?.nombre || estado.campos?.margenSugerido || estado.error) && (
        <p className="w-full text-sm text-destructive">{estado.campos?.nombre ?? estado.campos?.margenSugerido ?? estado.error}</p>
      )}
    </form>
  );
}

export function FilaCategoria({ categoria }: { categoria: CategoriaVista }) {
  const [editando, setEditando] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoFormulario, FormData>(async (prev, datos) => {
    const r = await guardarCategoriaAccion(prev, datos);
    if (r.ok) setEditando(false);
    return r;
  }, {});

  if (editando) {
    return (
      <li className="p-3">
        <form action={accion} className="flex flex-wrap items-start gap-3">
          <input type="hidden" name="id" value={categoria.id} />
          <Input name="nombre" defaultValue={categoria.nombre} aria-label="Nombre" className="min-w-40 flex-1" autoFocus />
          <div className="w-28">
            <Porcentaje
              name="margenSugerido"
              defaultValue={categoria.margenSugerido === null ? "" : String(categoria.margenSugerido).replace(".", ",")}
              placeholder="Margen"
              aria-label="Margen"
            />
          </div>
          <select name="activo" defaultValue={categoria.activo ? "si" : "no"} className="h-11 rounded-md border bg-transparent px-2" aria-label="Estado">
            <option value="si">Activa</option>
            <option value="no">Inactiva</option>
          </select>
          <Button type="submit" disabled={guardando}>
            Guardar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          {(estado.error || estado.campos?.nombre) && <p className="w-full text-sm text-destructive">{estado.campos?.nombre ?? estado.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {categoria.nombre} {!categoria.activo && <Badge variant="secondary">Inactiva</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">
          {categoria.productos} {categoria.productos === 1 ? "producto" : "productos"} ·{" "}
          {categoria.margenSugerido === null ? "margen del negocio" : `margen ${categoria.margenSugerido} %`}
        </p>
      </div>
      <Button variant="ghost" onClick={() => setEditando(true)}>
        Editar
      </Button>
    </li>
  );
}
