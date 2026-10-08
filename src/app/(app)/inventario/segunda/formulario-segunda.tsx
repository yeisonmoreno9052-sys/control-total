"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Banknote, Landmark } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatearPesos } from "@/lib/formato";
import { leerPesos } from "@/lib/inventario/esquemas";
import { calcularMargen, margenEfectivo, precioSugerido } from "@/lib/inventario/precios";
import { IVAS } from "@/lib/inventario/unidades";
import { cn } from "@/lib/utils";
import { guardarPiezaSegunda, type EstadoFormulario } from "../acciones";

const pesosATexto = (n: number) => (n ? new Intl.NumberFormat("es-CO").format(n) : "");

export function FormularioSegunda({
  categorias,
  margenNegocio,
  proveedores,
  cajaAbierta,
}: {
  categorias: { id: string; nombre: string; margenSugerido: number | null }[];
  margenNegocio: number;
  proveedores: { id: string; nombre: string }[];
  cajaAbierta: boolean;
}) {
  const [estado, accion, guardando] = useActionState<EstadoFormulario, FormData>(guardarPiezaSegunda, {});
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [precioManual, setPrecioManual] = useState(false);
  const [categoriaId, setCategoriaId] = useState("");
  const [medio, setMedio] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [desdeCaja, setDesdeCaja] = useState(cajaAbierta);
  const e = estado.campos ?? {};
  const primerCampo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) primerCampo.current?.focus();
  }, []);

  const costoNum = leerPesos(costo) ?? 0;
  const precioNum = leerPesos(precio) ?? 0;
  const margen = margenEfectivo(margenNegocio, categorias.find((c) => c.id === categoriaId)?.margenSugerido);
  const sugerido = precioSugerido(costoNum, margen);
  const ganancia = calcularMargen(costoNum, precioNum);

  return (
    <form action={accion} className="space-y-8" noValidate>
      <section className="grid gap-5 md:grid-cols-2">
        <Campo id="nombre" etiqueta="¿Qué pieza es?" error={e.nombre} className="md:col-span-2">
          <Input
            ref={primerCampo}
            id="nombre"
            name="nombre"
            placeholder="Ej.: Carburador Boxer 100 usado"
            required
            aria-invalid={!!e.nombre}
          />
        </Campo>
        <Campo
          id="descripcion"
          etiqueta="Detalles (opcional)"
          error={e.descripcion}
          ayuda="Estado, para qué moto sirve, si trae algo de más."
          className="md:col-span-2"
        >
          <Input id="descripcion" name="descripcion" aria-invalid={!!e.descripcion} />
        </Campo>
        <Campo id="proveedorId" etiqueta="¿A quién se la compraste?" error={e.proveedorId}>
          <NativeSelect id="proveedorId" name="proveedorId" defaultValue="">
            <option value="">A una persona (Particulares)</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </NativeSelect>
        </Campo>
        <Campo id="categoriaId" etiqueta="Categoría" error={e.categoriaId}>
          <NativeSelect
            id="categoriaId"
            name="categoriaId"
            value={categoriaId}
            onChange={(ev) => {
              setCategoriaId(ev.target.value);
              if (!precioManual) {
                const m = margenEfectivo(margenNegocio, categorias.find((c) => c.id === ev.target.value)?.margenSugerido);
                setPrecio(pesosATexto(precioSugerido(costoNum, m)));
              }
            }}
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </NativeSelect>
        </Campo>
      </section>

      <section className="space-y-5 rounded-xl border p-4 md:p-6">
        <h2 className="font-semibold">Costo y precio</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Campo id="cantidad" etiqueta="Cuántas" error={e.cantidad} ayuda="Normalmente 1.">
            <Input id="cantidad" name="cantidad" inputMode="numeric" defaultValue="1" aria-invalid={!!e.cantidad} />
          </Campo>
          <Campo id="costo" etiqueta="Cuánto pagaste por cada una" error={e.costo}>
            <Input
              id="costo"
              name="costo"
              inputMode="numeric"
              value={costo}
              placeholder="0"
              onChange={(ev) => {
                setCosto(ev.target.value);
                if (!precioManual) setPrecio(pesosATexto(precioSugerido(leerPesos(ev.target.value) ?? 0, margen)));
              }}
              onBlur={() => setCosto(pesosATexto(leerPesos(costo) ?? 0))}
              aria-invalid={!!e.costo}
            />
          </Campo>
          <Campo
            id="precioVenta"
            etiqueta="En cuánto la vendes"
            error={e.precioVenta}
            ayuda={
              sugerido > 0 && sugerido !== precioNum ? (
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => setPrecio(pesosATexto(sugerido))}
                >
                  Usar sugerido: {formatearPesos(sugerido)} ({margen} %)
                </button>
              ) : undefined
            }
          >
            <Input
              id="precioVenta"
              name="precioVenta"
              inputMode="numeric"
              value={precio}
              onChange={(ev) => {
                setPrecio(ev.target.value);
                setPrecioManual(true);
              }}
              onBlur={() => setPrecio(pesosATexto(leerPesos(precio) ?? 0))}
              required
              aria-invalid={!!e.precioVenta}
            />
          </Campo>
          <div className="space-y-2">
            <p className="text-sm font-medium">Ganancia por pieza</p>
            <div className="flex h-11 items-center rounded-md bg-muted px-3 tabular-nums" aria-live="polite">
              {ganancia ? (
                <span className={ganancia.ganancia < 0 ? "text-destructive" : ""}>
                  {formatearPesos(ganancia.ganancia)} · {ganancia.porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %
                </span>
              ) : (
                <span className="text-muted-foreground">Escribe lo que pagaste</span>
              )}
            </div>
          </div>
          <Campo id="porcentajeIva" etiqueta="IVA al venderla" error={e.porcentajeIva}>
            <NativeSelect id="porcentajeIva" name="porcentajeIva" defaultValue="19">
              {IVAS.map((v) => (
                <option key={v} value={v}>
                  {v} %
                </option>
              ))}
            </NativeSelect>
          </Campo>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4 md:p-6">
        <h2 className="font-semibold">¿Cómo la pagaste?</h2>
        <input type="hidden" name="medio" value={medio} />
        <div role="radiogroup" aria-label="Medio de pago" className="grid grid-cols-2 gap-2">
          {(
            [
              ["EFECTIVO", "Efectivo", Banknote],
              ["TRANSFERENCIA", "Transferencia", Landmark],
            ] as const
          ).map(([m, nombre, Icono]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={medio === m}
              onClick={() => setMedio(m)}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium",
                medio === m ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              <Icono className="size-4" /> {nombre}
            </button>
          ))}
        </div>
        {medio === "EFECTIVO" && (
          <label className={cn("flex items-start gap-3 rounded-lg border p-3", !cajaAbierta && "opacity-60")}>
            <input
              type="checkbox"
              name="desdeCaja"
              className="mt-1 size-5 accent-primary"
              checked={desdeCaja}
              disabled={!cajaAbierta}
              onChange={(ev) => setDesdeCaja(ev.target.checked)}
            />
            <span>
              <span className="font-medium">El dinero sale de la caja de hoy</span>
              <span className="block text-sm text-muted-foreground">
                {cajaAbierta
                  ? "Se descuenta del efectivo esperado en el cierre. Desmárcalo si pagaste con plata que no estaba en la caja."
                  : "La caja de hoy no está abierta, así que este pago no se descuenta de ella."}
              </span>
            </span>
          </label>
        )}
      </section>

      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" className="w-full md:w-auto" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar e imprimir etiqueta"}
      </Button>
    </form>
  );
}
