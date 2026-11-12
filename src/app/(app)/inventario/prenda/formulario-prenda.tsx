"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, Save } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatearPesos } from "@/lib/formato";
import { leerPesos } from "@/lib/inventario/esquemas";
import { calcularMargen, margenEfectivo, precioSugerido } from "@/lib/inventario/precios";
import { TALLAS_RAPIDAS } from "@/lib/inventario/prendas";
import { IVAS } from "@/lib/inventario/unidades";
import { crearPrendaAccion } from "./acciones";
import { COLORES_RAPIDOS, CuadroCantidades, EditorOpciones } from "./componentes";

const pesosATexto = (n: number) => (n ? new Intl.NumberFormat("es-CO").format(n) : "");

export function FormularioPrenda({
  categorias,
  margenNegocio,
  ivaPorDefecto,
  verCostos,
}: {
  categorias: { id: string; nombre: string; margenSugerido: number | null }[];
  margenNegocio: number;
  ivaPorDefecto: number;
  verCostos: boolean;
}) {
  const router = useRouter();
  const [guardando, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tallas, setTallas] = useState<string[]>([]);
  const [colores, setColores] = useState<string[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [precioManual, setPrecioManual] = useState(false);
  const [iva, setIva] = useState(String(ivaPorDefecto));
  const [minimo, setMinimo] = useState("1");
  const primerCampo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) primerCampo.current?.focus();
  }, []);

  const costoNum = leerPesos(costo) ?? 0;
  const precioNum = leerPesos(precio) ?? 0;
  const margen = margenEfectivo(margenNegocio, categorias.find((c) => c.id === categoriaId)?.margenSugerido);
  const sugerido = precioSugerido(costoNum, margen);
  const ganancia = calcularMargen(costoNum, precioNum);

  function guardar(imprimir: boolean) {
    setError(undefined);
    iniciar(async () => {
      const r = await crearPrendaAccion({
        nombre,
        categoriaId,
        descripcion,
        costo: costo || "0",
        precioVenta: precio,
        porcentajeIva: iva,
        stockMinimo: minimo,
        tallas,
        colores,
        cantidades,
      });
      if (!r.ok) {
        setError(r.error);
        setCampos(r.campos ?? {});
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(imprimir ? `/etiqueta/prenda/${r.prendaId}?nueva=1` : `/inventario/prenda/${r.prendaId}?creada=1`);
    });
  }

  return (
    <form
      className="space-y-8"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        guardar(true);
      }}
    >
      <AvisoError mensaje={error} />

      <section className="grid gap-5 md:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre de la prenda" error={campos.nombre} ayuda="Sin la talla ni el color." className="md:col-span-2">
          <Input
            ref={primerCampo}
            id="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Blusa Lina, Jean tiro alto"
            aria-invalid={!!campos.nombre}
          />
        </Campo>
        <Campo id="categoriaId" etiqueta="Categoría" error={campos.categoriaId}>
          <NativeSelect
            id="categoriaId"
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
        <Campo id="descripcion" etiqueta="Detalles (opcional)" error={campos.descripcion}>
          <Input id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Tela, marca, temporada…" />
        </Campo>
      </section>

      <section className="space-y-6 rounded-xl border bg-card p-4 shadow-suave md:p-6">
        <div>
          <h2 className="font-semibold">Tallas</h2>
          <p className="text-sm text-muted-foreground">Escríbelas o toca un grupo.</p>
        </div>
        <EditorOpciones
          id="talla"
          valores={tallas}
          onCambiar={setTallas}
          sugeridas={TALLAS_RAPIDAS.map((t) => ({ nombre: t.nombre, valores: t.tallas }))}
          placeholder="Ej.: M, 10, 38"
          error={campos.tallas}
        />
        <div className="border-t pt-6">
          <h2 className="font-semibold">Colores</h2>
          <p className="text-sm text-muted-foreground">Si no la manejas por color, déjalo vacío.</p>
        </div>
        <EditorOpciones
          id="color"
          valores={colores}
          onCambiar={setColores}
          sugeridas={COLORES_RAPIDOS}
          placeholder="Ej.: Negro, Azul claro"
          error={campos.colores}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">¿Cuántas tienes de cada una?</h2>
          <p className="text-sm text-muted-foreground">Cada talla y color queda con su propio código y su etiqueta.</p>
        </div>
        <CuadroCantidades tallas={tallas} colores={colores} cantidades={cantidades} onCambiar={setCantidades} />
        {campos.cantidades && <p className="text-sm text-destructive">{campos.cantidades}</p>}
      </section>

      <section className="space-y-5 rounded-xl border bg-card p-4 shadow-suave md:p-6">
        <h2 className="font-semibold">Precio</h2>
        <p className="-mt-3 text-sm text-muted-foreground">El mismo para todas las tallas. Si una talla vale distinto, la cambias después.</p>
        <div className="grid gap-5 md:grid-cols-3">
          {verCostos && (
            <Campo id="costo" etiqueta="Costo de cada una" error={campos.costo}>
              <Input
                id="costo"
                inputMode="numeric"
                value={costo}
                placeholder="0"
                onChange={(ev) => {
                  setCosto(ev.target.value);
                  if (!precioManual) setPrecio(pesosATexto(precioSugerido(leerPesos(ev.target.value) ?? 0, margen)));
                }}
                onBlur={() => setCosto(pesosATexto(leerPesos(costo) ?? 0))}
                aria-invalid={!!campos.costo}
              />
            </Campo>
          )}
          <Campo
            id="precioVenta"
            etiqueta="Precio de venta"
            error={campos.precioVenta}
            ayuda={
              verCostos && sugerido > 0 && sugerido !== precioNum ? (
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => setPrecio(pesosATexto(sugerido))}>
                  Usar sugerido: {formatearPesos(sugerido)} ({margen} %)
                </button>
              ) : undefined
            }
          >
            <Input
              id="precioVenta"
              inputMode="numeric"
              value={precio}
              onChange={(ev) => {
                setPrecio(ev.target.value);
                setPrecioManual(true);
              }}
              onBlur={() => setPrecio(pesosATexto(leerPesos(precio) ?? 0))}
              aria-invalid={!!campos.precioVenta}
            />
          </Campo>
          {verCostos && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Ganancia por prenda</p>
              <div className="flex h-11 items-center rounded-md bg-muted px-3 tabular-nums" aria-live="polite">
                {ganancia ? (
                  <span className={ganancia.ganancia < 0 ? "text-destructive" : ""}>
                    {formatearPesos(ganancia.ganancia)} · {ganancia.porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %
                  </span>
                ) : (
                  <span className="text-muted-foreground">Escribe el costo</span>
                )}
              </div>
            </div>
          )}
          <Campo id="porcentajeIva" etiqueta="IVA" error={campos.porcentajeIva}>
            <NativeSelect id="porcentajeIva" value={iva} onChange={(e) => setIva(e.target.value)}>
              {IVAS.map((v) => (
                <option key={v} value={v}>
                  {v} %
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo id="stockMinimo" etiqueta="Avisar cuando queden" error={campos.stockMinimo} ayuda="De cada talla y color. 0 = no avisar.">
            <Input id="stockMinimo" inputMode="numeric" value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Campo>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" size="lg" disabled={guardando}>
          <Printer /> {guardando ? "Guardando…" : "Guardar e imprimir etiquetas"}
        </Button>
        <Button type="button" size="lg" variant="outline" disabled={guardando} onClick={() => guardar(false)}>
          <Save /> Guardar sin imprimir
        </Button>
      </div>
    </form>
  );
}
