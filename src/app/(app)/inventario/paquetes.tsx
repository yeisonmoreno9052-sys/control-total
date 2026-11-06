"use client";

import { useState } from "react";
import { Package, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { formatearPesos } from "@/lib/formato";
import { formatearCantidad, leerCantidad } from "@/lib/inventario/cantidades";
import { MAXIMO_PRESENTACIONES, type Presentacion } from "@/lib/inventario/presentaciones";
import { UNIDADES } from "@/lib/inventario/unidades";

type Fila = { id: string | null; nombre: string; cantidad: string; precio: number | null; clave: number };

/** Ejemplos según la unidad, para que se entienda sin explicación. */
const EJEMPLOS: Partial<Record<UnidadMedida, { nombre: string; cantidad: string }>> = {
  METRO: { nombre: "Tubo completo", cantidad: "6" },
  UNIDAD: { nombre: "Caja", cantidad: "100" },
  KILO: { nombre: "Bulto", cantidad: "50" },
  LIBRA: { nombre: "Bulto", cantidad: "50" },
  GALON: { nombre: "Caneca", cantidad: "5" },
  LITRO: { nombre: "Galón", cantidad: "4" },
};

/**
 * "Se vende también por paquete": tubo completo de 6 m a $20.000, caja de 100 tornillos,
 * rollo de malla o de alambre. En la caja, al escanear el producto, la cajera elige cómo lo lleva.
 * La lista viaja al servidor en un campo oculto, en JSON.
 */
export function SeccionPaquetes({
  inicial,
  unidad,
  precioUnidad,
  error,
}: {
  inicial: Presentacion[];
  unidad: UnidadMedida;
  precioUnidad: number;
  error?: string;
}) {
  const [filas, setFilas] = useState<Fila[]>(() =>
    inicial.map((p, i) => ({ id: p.id, nombre: p.nombre, cantidad: formatearCantidad(p.cantidad), precio: p.precio, clave: i })),
  );
  const [siguiente, setSiguiente] = useState(inicial.length);
  const corto = UNIDADES[unidad].corto;
  const ejemplo = EJEMPLOS[unidad] ?? { nombre: "Paquete", cantidad: "10" };

  const cambiar = (clave: number, cambios: Partial<Fila>) =>
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));

  const agregar = () => {
    setFilas((fs) => [...fs, { id: null, nombre: fs.length ? "" : ejemplo.nombre, cantidad: "", precio: null, clave: siguiente }]);
    setSiguiente((n) => n + 1);
  };

  const valor = JSON.stringify(
    filas.map((f) => ({ id: f.id, nombre: f.nombre, cantidad: f.cantidad, precio: f.precio ?? "" })),
  );

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-suave md:p-6">
      <input type="hidden" name="presentaciones" value={valor} />
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Package className="size-5 text-primary" /> Se vende también por paquete (opcional)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Por ejemplo: {ejemplo.nombre.toLowerCase()} de {ejemplo.cantidad} {corto} con su propio precio. En la caja te
          preguntamos cómo lo lleva el cliente, y del inventario sale lo que trae el paquete.
        </p>
      </div>

      {filas.length > 0 && (
        <ul className="space-y-3">
          {filas.map((f, i) => {
            const cantidad = leerCantidad(f.cantidad);
            const porUnidad = cantidad && cantidad.gt(0) && f.precio ? Math.round(f.precio / cantidad.toNumber()) : null;
            return (
              <li key={f.clave} className="rounded-lg border p-3">
                <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:items-end">
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">Nombre</span>
                    <Input
                      value={f.nombre}
                      onChange={(e) => cambiar(f.clave, { nombre: e.target.value })}
                      placeholder={ejemplo.nombre}
                      maxLength={40}
                      aria-label={`Nombre del paquete ${i + 1}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                    aria-label={`Quitar el paquete ${f.nombre || i + 1}`}
                    className="col-start-2 row-start-1 self-end rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:col-start-4"
                  >
                    <X className="size-5" />
                  </button>
                  <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-2 sm:col-start-2 sm:row-start-1">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Trae</span>
                      <span className="relative block">
                        <Input
                          value={f.cantidad}
                          onChange={(e) => cambiar(f.clave, { cantidad: e.target.value })}
                          inputMode="decimal"
                          placeholder={ejemplo.cantidad}
                          className="pr-12 tabular-nums"
                          aria-label={`Cuánto trae el paquete ${i + 1}, en ${UNIDADES[unidad].nombre.toLowerCase()}`}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                          {corto}
                        </span>
                      </span>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Precio del paquete</span>
                      <CampoPesos
                        valor={f.precio}
                        onValor={(precio) => cambiar(f.clave, { precio })}
                        aria-label={`Precio del paquete ${i + 1}`}
                      />
                    </label>
                  </div>
                </div>
                {porUnidad !== null && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sale a {formatearPesos(porUnidad)} el {corto}
                    {precioUnidad > 0 && cantidad && (
                      <>
                        {" "}
                        · suelto serían {formatearPesos(Math.round(precioUnidad * cantidad.toNumber()))}
                      </>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {filas.length < MAXIMO_PRESENTACIONES && (
        <Button type="button" variant="outline" onClick={agregar}>
          <Plus /> {filas.length ? "Agregar otro paquete" : "Agregar paquete"}
        </Button>
      )}
    </section>
  );
}
