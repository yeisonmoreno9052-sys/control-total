"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { CondicionProducto, UnidadMedida } from "@/generated/prisma/enums";
import { formatearPesos } from "@/lib/formato";
import { leerPesos } from "@/lib/inventario/esquemas";
import { calcularMargen, margenEfectivo, precioSugerido } from "@/lib/inventario/precios";
import { CONDICIONES, IVAS, UNIDADES } from "@/lib/inventario/unidades";
import { guardarProducto, type EstadoFormulario } from "./acciones";

export type ValoresProducto = {
  id?: string;
  codigo: string;
  codigoBarras: string;
  nombre: string;
  descripcion: string;
  categoriaId: string;
  costo: number;
  precioVenta: number;
  stockMinimo: string;
  unidad: UnidadMedida;
  fraccionado: boolean;
  porcentajeIva: number;
  condicion: CondicionProducto;
};

/** En los campos de texto, Enter pasa al siguiente campo en vez de enviar el formulario. */
function enterAlSiguiente(e: React.KeyboardEvent<HTMLFormElement>) {
  const objetivo = e.target as HTMLElement;
  if (e.key !== "Enter" || !(objetivo instanceof HTMLInputElement) || objetivo.type === "submit") return;
  e.preventDefault();
  const campos = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea, button[type=submit]"),
  );
  campos[campos.indexOf(objetivo) + 1]?.focus();
}

const pesosATexto = (n: number) => (n ? new Intl.NumberFormat("es-CO").format(n) : "");

export function FormularioProducto({
  valores,
  categorias,
  margenNegocio,
}: {
  valores?: ValoresProducto;
  categorias: { id: string; nombre: string; margenSugerido: number | null }[];
  margenNegocio: number;
}) {
  const [estado, accion, guardando] = useActionState<EstadoFormulario, FormData>(guardarProducto, {});
  const nuevo = !valores?.id;
  const [costo, setCosto] = useState(pesosATexto(valores?.costo ?? 0));
  const [precio, setPrecio] = useState(pesosATexto(valores?.precioVenta ?? 0));
  // Mientras la persona no escriba un precio a mano, el precio sigue al sugerido.
  const [precioManual, setPrecioManual] = useState(!!valores?.id);
  const [categoriaId, setCategoriaId] = useState(valores?.categoriaId ?? "");
  const [unidad, setUnidad] = useState<UnidadMedida>(valores?.unidad ?? "UNIDAD");
  const [fraccionado, setFraccionado] = useState(valores?.fraccionado ?? false);
  const e = estado.campos ?? {};
  const primerCampo = useRef<HTMLInputElement>(null);

  // La página llega por partes (streaming), así que el autoFocus del navegador no
  // siempre aplica: enfocamos el nombre al montar, solo en computador.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) primerCampo.current?.focus();
  }, []);

  const costoNum = leerPesos(costo) ?? 0;
  const precioNum = leerPesos(precio) ?? 0;
  const margenCategoria = categorias.find((c) => c.id === categoriaId)?.margenSugerido;
  const margen = margenEfectivo(margenNegocio, margenCategoria);
  const sugerido = precioSugerido(costoNum, margen);
  const actual = calcularMargen(costoNum, precioNum);

  return (
    <form action={accion} onKeyDown={enterAlSiguiente} className="space-y-8" noValidate>
      {valores?.id && <input type="hidden" name="id" value={valores.id} />}

      <section className="grid gap-5 md:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre" error={e.nombre} className="md:col-span-2">
          <Input ref={primerCampo} id="nombre" name="nombre" defaultValue={valores?.nombre} required aria-invalid={!!e.nombre} />
        </Campo>
        <Campo id="codigo" etiqueta="Código o referencia" error={e.codigo}>
          <Input id="codigo" name="codigo" defaultValue={valores?.codigo} required aria-invalid={!!e.codigo} autoComplete="off" />
        </Campo>
        <Campo id="codigoBarras" etiqueta="Código de barras" error={e.codigoBarras} ayuda="Opcional. Puedes escanearlo aquí.">
          <Input id="codigoBarras" name="codigoBarras" defaultValue={valores?.codigoBarras} aria-invalid={!!e.codigoBarras} autoComplete="off" inputMode="numeric" />
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
        <Campo id="condicion" etiqueta="Condición" error={e.condicion}>
          <NativeSelect id="condicion" name="condicion" defaultValue={valores?.condicion ?? "NUEVO"}>
            {Object.entries(CONDICIONES).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </Campo>
      </section>

      <section className="space-y-5 rounded-xl border p-4 md:p-6">
        <h2 className="font-semibold">Precio</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Campo id="costo" etiqueta="Costo" error={e.costo}>
            <Input
              id="costo"
              name="costo"
              inputMode="numeric"
              value={costo}
              onChange={(ev) => {
                setCosto(ev.target.value);
                if (!precioManual) {
                  const nuevo = precioSugerido(leerPesos(ev.target.value) ?? 0, margen);
                  setPrecio(pesosATexto(nuevo));
                }
              }}
              onBlur={() => setCosto(pesosATexto(leerPesos(costo) ?? 0))}
              placeholder="0"
              aria-invalid={!!e.costo}
            />
          </Campo>
          <Campo
            id="precioVenta"
            etiqueta="Precio de venta"
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
            <p className="text-sm font-medium">Ganancia</p>
            <div className="flex h-11 items-center rounded-md bg-muted px-3 tabular-nums" aria-live="polite">
              {actual ? (
                <span className={actual.ganancia < 0 ? "text-destructive" : ""}>
                  {formatearPesos(actual.ganancia)} · {actual.porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %
                </span>
              ) : (
                <span className="text-muted-foreground">Escribe el costo</span>
              )}
            </div>
          </div>
          <Campo id="porcentajeIva" etiqueta="IVA" error={e.porcentajeIva}>
            <NativeSelect id="porcentajeIva" name="porcentajeIva" defaultValue={String(valores?.porcentajeIva ?? 19)}>
              {IVAS.map((v) => (
                <option key={v} value={v}>
                  {v} %
                </option>
              ))}
            </NativeSelect>
          </Campo>
        </div>
      </section>

      <section className="space-y-5 rounded-xl border p-4 md:p-6">
        <h2 className="font-semibold">Inventario</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Campo id="unidad" etiqueta="Unidad de medida" error={e.unidad}>
            <NativeSelect
              id="unidad"
              name="unidad"
              value={unidad}
              onChange={(ev) => {
                const u = ev.target.value as UnidadMedida;
                setUnidad(u);
                if (u === "UNIDAD") setFraccionado(false);
              }}
            >
              {Object.entries(UNIDADES).map(([v, u]) => (
                <option key={v} value={v}>
                  {u.nombre}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          {nuevo && (
            <Campo id="stockInicial" etiqueta="Stock inicial" error={e.stockInicial} ayuda={fraccionado ? "Puedes usar decimales: 2,5" : undefined}>
              <Input id="stockInicial" name="stockInicial" inputMode="decimal" placeholder="0" aria-invalid={!!e.stockInicial} />
            </Campo>
          )}
          <Campo id="stockMinimo" etiqueta="Stock mínimo" error={e.stockMinimo} ayuda="Te avisamos cuando quede esto o menos.">
            <Input id="stockMinimo" name="stockMinimo" inputMode="decimal" defaultValue={valores?.stockMinimo === "0" ? "" : valores?.stockMinimo.replace(".", ",")} placeholder="0" aria-invalid={!!e.stockMinimo} />
          </Campo>
        </div>
        <label className="flex items-start gap-3 rounded-lg border p-3 has-[:disabled]:opacity-60">
          <input
            type="checkbox"
            name="fraccionado"
            checked={fraccionado}
            disabled={unidad === "UNIDAD"}
            onChange={(ev) => setFraccionado(ev.target.checked)}
            className="mt-0.5 size-5 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium">Se vende fraccionado</span>
            <span className="block text-sm text-muted-foreground">
              {unidad === "UNIDAD" ? "Cambia la unidad a metro, kilo o litro para vender por partes." : "Permite vender cantidades como 2,5 m o 0,350 kg."}
            </span>
          </span>
        </label>
        {e.fraccionado && <p className="text-sm text-destructive">{e.fraccionado}</p>}
      </section>

      <Campo id="descripcion" etiqueta="Descripción (opcional)" error={e.descripcion}>
        <Textarea id="descripcion" name="descripcion" defaultValue={valores?.descripcion} rows={2} />
      </Campo>

      <AvisoError mensaje={estado.error} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {nuevo && (
          <Button type="submit" name="otro" value="1" variant="outline" size="lg" disabled={guardando}>
            Guardar y crear otro
          </Button>
        )}
        <Button type="submit" size="lg" disabled={guardando}>
          {guardando ? "Guardando…" : nuevo ? "Crear producto" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
