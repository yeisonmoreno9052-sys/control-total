"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { claveVariante, limpiarOpcion, normalizar } from "@/lib/inventario/prendas";
import { cn } from "@/lib/utils";

/** Lista de tallas o colores como fichas: se escriben y se agregan con Enter o con el botón. */
export function EditorOpciones({
  id,
  valores,
  onCambiar,
  sugeridas = [],
  fijas = [],
  placeholder,
  error,
}: {
  id: string;
  valores: string[];
  onCambiar: (v: string[]) => void;
  /** Botones de un toque para agregar las más comunes. */
  sugeridas?: { nombre: string; valores: string[] }[];
  /** Las que ya existen en la prenda: se muestran pero no se quitan. */
  fijas?: string[];
  placeholder: string;
  error?: string;
}) {
  const [texto, setTexto] = useState("");
  const existe = (v: string) => [...fijas, ...valores].some((x) => normalizar(x) === normalizar(v));

  const agregar = (lista: string[]) => {
    const nuevas: string[] = [];
    for (const v of lista.map(limpiarOpcion)) {
      if (v && !existe(v) && !nuevas.some((x) => normalizar(x) === normalizar(v))) nuevas.push(v.slice(0, 20));
    }
    if (nuevas.length) onCambiar([...valores, ...nuevas]);
  };

  const agregarTexto = () => {
    // "S, M, L" o "Rojo, Azul" también sirven: se separan por comas.
    agregar(texto.split(","));
    setTexto("");
  };

  return (
    <div className="space-y-3">
      {(fijas.length > 0 || valores.length > 0) && (
        <ul className="flex flex-wrap gap-2" aria-label="Agregadas">
          {fijas.map((v) => (
            <li key={`f-${v}`} className="flex h-10 items-center rounded-full border bg-muted px-4 font-medium text-muted-foreground">
              {v}
            </li>
          ))}
          {valores.map((v) => (
            <li key={v} className="flex h-10 items-center gap-1 rounded-full border border-primary/40 bg-accent pr-1 pl-4 font-medium text-accent-foreground">
              {v}
              <button
                type="button"
                onClick={() => onCambiar(valores.filter((x) => x !== v))}
                className="flex size-8 items-center justify-center rounded-full hover:bg-background/60"
                aria-label={`Quitar ${v}`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregarTexto();
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={!!error}
          className="max-w-xs"
        />
        <Button type="button" variant="outline" onClick={agregarTexto} disabled={!texto.trim()}>
          <Plus /> Agregar
        </Button>
      </div>
      {sugeridas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Rápido:</span>
          {sugeridas.map((s) => (
            <button
              key={s.nombre}
              type="button"
              onClick={() => agregar(s.valores)}
              className="rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
              title={s.valores.join(", ")}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Cuadro de cantidades: una fila por color y una columna por talla.
 * Las combinaciones que ya existen (al agregar tallas) se muestran bloqueadas.
 */
export function CuadroCantidades({
  tallas,
  colores,
  cantidades,
  onCambiar,
  existentes,
}: {
  tallas: string[];
  colores: string[];
  cantidades: Record<string, string>;
  onCambiar: (c: Record<string, string>) => void;
  existentes?: Set<string>;
}) {
  if (!tallas.length) {
    return <p className="rounded-lg border border-dashed p-4 text-muted-foreground">Agrega las tallas para escribir cuántas llegaron.</p>;
  }
  const filas: (string | null)[] = colores.length ? colores : [null];
  const total = Object.entries(cantidades).reduce((a, [, v]) => a + (Number(v) || 0), 0);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-center">
          <thead>
            <tr className="bg-muted/60">
              <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground">{colores.length ? "Color" : ""}</th>
              {tallas.map((t) => (
                <th key={t} className="min-w-16 px-2 py-2 text-base font-semibold">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((color) => (
              <tr key={color ?? "sin"} className="border-t">
                <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {color ?? "Cantidad"}
                </th>
                {tallas.map((talla) => {
                  const clave = claveVariante(talla, color);
                  const ya = existentes?.has(clave);
                  return (
                    <td key={clave} className="p-1.5">
                      {ya ? (
                        <span className="flex h-12 items-center justify-center text-sm text-muted-foreground">Ya existe</span>
                      ) : (
                        <input
                          inputMode="numeric"
                          aria-label={`Cantidad ${talla}${color ? ` ${color}` : ""}`}
                          value={cantidades[clave] ?? ""}
                          placeholder="0"
                          onChange={(e) => onCambiar({ ...cantidades, [clave]: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                          onFocus={(e) => e.target.select()}
                          className={cn(
                            "h-12 w-full min-w-14 rounded-lg border bg-background text-center text-lg tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/30",
                            Number(cantidades[clave]) > 0 && "border-primary/50 bg-accent/40 font-semibold",
                          )}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total > 0 ? `${total.toLocaleString("es-CO")} ${total === 1 ? "unidad" : "unidades"} en total.` : "Deja en 0 las que no tengas: igual quedan creadas para cuando lleguen."}
      </p>
    </div>
  );
}

export const COLORES_RAPIDOS = [
  { nombre: "Negro", valores: ["Negro"] },
  { nombre: "Blanco", valores: ["Blanco"] },
  { nombre: "Azul", valores: ["Azul"] },
  { nombre: "Rojo", valores: ["Rojo"] },
  { nombre: "Beige", valores: ["Beige"] },
  { nombre: "Gris", valores: ["Gris"] },
  { nombre: "Rosado", valores: ["Rosado"] },
  { nombre: "Verde", valores: ["Verde"] },
];
