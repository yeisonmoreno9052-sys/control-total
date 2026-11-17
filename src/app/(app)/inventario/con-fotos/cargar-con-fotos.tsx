"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CircleAlert, CircleCheck, ImageIcon, LoaderCircle, Sparkles, X } from "lucide-react";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { useCampoTeclado } from "@/components/ventas/teclado-numerico";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { achicarFoto } from "@/lib/achicar-foto";
import type { ProductoExistente, ProductoPropuesto, ProductoRevisado } from "@/lib/datos/lectura-productos";
import { cn } from "@/lib/utils";
import { prepararHoja } from "../../proveedores/facturas/nueva/hojas";
import { guardarProductosFotoAccion, leerProductosFotoAccion } from "./acciones";

/** Igual que en el servidor (lib/datos/lectura-productos). */
const FOTOS_POR_TANDA = 10;
const PRODUCTOS_POR_ENVIO = 10;
/** Tamaño con el que la IA lee bien nombres y códigos de barras sin subir fotos pesadas. */
const LADO_LECTURA = 1400;

type Foto = {
  id: string;
  url: string;
  /** La foto preparada para que la IA la lea. */
  paraLeer: File;
  /** Cuadrada y liviana: la foto del producto. */
  miniatura: Blob;
  estado: "pendiente" | "leyendo" | "leida" | "error";
};

type Fila = {
  clave: string;
  fotoId: string;
  nombre: string;
  marca: string | null;
  codigoBarras: string | null;
  precioVisto: number | null;
  precio: number | null;
  costo: number | null;
  cantidad: string;
  /** "" = sin categoría, un id, o "nueva" (la sugerida, que se crea al guardar). */
  categoria: string;
  categoriaNueva: string | null;
  usarFoto: boolean;
  existente: ProductoExistente | null;
  accion: "crear" | "sumar";
  error?: string;
};

let contador = 0;
const nuevaClave = () => `f${Date.now().toString(36)}${(contador++).toString(36)}`;

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function CargarConFotos({
  usadas: usadasIniciales,
  limite,
  categorias,
}: {
  usadas: number;
  limite: number;
  categorias: { id: string; nombre: string }[];
}) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [usadas, setUsadas] = useState(usadasIniciales);
  const [preparando, setPreparando] = useState(0);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState<string[]>([]);
  const [listo, setListo] = useState<{ creados: number; sumados: number } | null>(null);

  const pendientes = fotos.filter((f) => f.estado === "pendiente" || f.estado === "error");
  const leidas = fotos.filter((f) => f.estado === "leida").length;
  const quedan = Math.max(limite - usadas, 0);
  const tandas = Math.ceil(pendientes.length / FOTOS_POR_TANDA);
  const fotoDe = (id: string) => fotos.find((f) => f.id === id);

  // No perder el trabajo por cerrar la pantalla sin guardar.
  useEffect(() => {
    if (!filas.length && !pendientes.length) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [filas.length, pendientes.length]);

  async function agregarFotos(lista: FileList | null, entrada: HTMLInputElement | null) {
    const archivos = Array.from(lista ?? []).filter((a) => a.type.startsWith("image/") || !a.type);
    if (entrada) entrada.value = "";
    if (!archivos.length) return;
    setError(null);
    setListo(null);
    setPreparando((n) => n + archivos.length);
    for (const archivo of archivos) {
      try {
        const [paraLeer, miniatura] = await Promise.all([prepararHoja(archivo, LADO_LECTURA), achicarFoto(archivo)]);
        const foto: Foto = { id: nuevaClave(), url: URL.createObjectURL(miniatura), paraLeer, miniatura, estado: "pendiente" };
        setFotos((antes) => [...antes, foto]);
      } catch {
        setError("No pudimos abrir una de las fotos. Tómala de nuevo.");
      } finally {
        setPreparando((n) => n - 1);
      }
    }
  }

  function quitarFoto(id: string) {
    setFotos((antes) => {
      const f = antes.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.url);
      return antes.filter((x) => x.id !== id);
    });
  }

  async function leer() {
    if (!pendientes.length || leyendo) return;
    if (tandas > quedan) {
      setError(
        quedan
          ? `Te quedan ${quedan} lecturas este mes y estas fotos necesitan ${tandas}. Quita algunas fotos.`
          : "Ya se usaron las lecturas con foto de este mes.",
      );
      return;
    }
    setLeyendo(true);
    setError(null);
    setListo(null);
    const cola = [...pendientes];
    for (let i = 0; i < cola.length; i += FOTOS_POR_TANDA) {
      const tanda = cola.slice(i, i + FOTOS_POR_TANDA);
      const ids = new Set(tanda.map((f) => f.id));
      setFotos((antes) => antes.map((f) => (ids.has(f.id) ? { ...f, estado: "leyendo" } : f)));
      try {
        const formulario = new FormData();
        for (const f of tanda) formulario.append("foto", f.paraLeer);
        const r = await leerProductosFotoAccion(formulario);
        if (!r.ok) {
          setError(r.error);
          setFotos((antes) => antes.map((f) => (ids.has(f.id) ? { ...f, estado: "error" } : f)));
          // Si se acabaron las lecturas no tiene sentido seguir con las otras tandas.
          if (r.error.includes("lecturas")) break;
          continue;
        }
        setUsadas((n) => n + 1);
        setFotos((antes) => antes.map((f) => (ids.has(f.id) ? { ...f, estado: "leida" } : f)));
        if (r.nota) setNotas((antes) => [...antes, r.nota!]);
        agregarFilas(r.productos, tanda);
      } catch {
        setError("No pudimos leer las fotos. Revisa la conexión a internet e intenta de nuevo.");
        setFotos((antes) => antes.map((f) => (ids.has(f.id) ? { ...f, estado: "error" } : f)));
      }
    }
    setLeyendo(false);
  }

  function agregarFilas(productos: ProductoPropuesto[], tanda: Foto[]) {
    setFilas((antes) => {
      const vistos = new Set(antes.map((f) => normal(f.nombre)));
      const nuevas: Fila[] = [];
      for (const p of productos) {
        // Dos fotos del mismo producto: queda una sola fila.
        if (vistos.has(normal(p.nombre))) continue;
        vistos.add(normal(p.nombre));
        const categoria = p.categoriaId ?? (p.categoriaNueva ? "nueva" : "");
        nuevas.push({
          clave: nuevaClave(),
          fotoId: tanda[p.foto]?.id ?? tanda[0].id,
          nombre: p.nombre,
          marca: p.marca,
          codigoBarras: p.codigoBarras,
          precioVisto: p.precio,
          precio: p.precio ?? p.existente?.precioVenta ?? null,
          costo: null,
          cantidad: p.cantidad,
          categoria,
          categoriaNueva: p.categoriaNueva,
          usarFoto: p.usarFoto,
          existente: p.existente,
          accion: p.existente ? "sumar" : "crear",
        });
      }
      return [...antes, ...nuevas];
    });
  }

  const cambiar = (clave: string, cambios: Partial<Fila>) =>
    setFilas((antes) => antes.map((f) => (f.clave === clave ? { ...f, ...cambios, error: undefined } : f)));
  const quitarFila = (clave: string) => setFilas((antes) => antes.filter((f) => f.clave !== clave));

  const nuevos = filas.filter((f) => f.accion === "crear").length;
  const existentes = filas.length - nuevos;

  async function guardar() {
    if (!filas.length || guardando) return;
    // Lo que falta se marca en cada tarjeta, antes de mandar nada.
    const falta = (f: Fila) =>
      !f.nombre.trim() ? "Escribe el nombre." : f.accion === "crear" && !(f.precio && f.precio > 0) ? "Falta el precio de venta." : null;
    const incompletos = filas.filter((f) => falta(f)).length;
    if (incompletos) {
      setFilas((antes) => antes.map((f) => (falta(f) ? { ...f, error: falta(f)! } : f)));
      setError(incompletos === 1 ? "A 1 producto le falta el precio o el nombre." : `A ${incompletos} productos les falta el precio o el nombre.`);
      return;
    }

    setGuardando(true);
    setError(null);
    let creados = 0;
    let sumados = 0;
    const cola = [...filas];
    for (let i = 0; i < cola.length; i += PRODUCTOS_POR_ENVIO) {
      const parte = cola.slice(i, i + PRODUCTOS_POR_ENVIO);
      const formulario = new FormData();
      const revisados: ProductoRevisado[] = parte.map((f) => ({
        clave: f.clave,
        accion: f.accion,
        productoId: f.accion === "sumar" ? (f.existente?.id ?? null) : null,
        nombre: f.nombre.trim(),
        codigoBarras: f.codigoBarras,
        categoriaId: f.categoria && f.categoria !== "nueva" ? f.categoria : null,
        categoriaNueva: f.categoria === "nueva" ? f.categoriaNueva : null,
        precioVenta: f.precio ?? 0,
        costo: f.costo ?? 0,
        cantidad: f.cantidad,
      }));
      formulario.set("productos", JSON.stringify(revisados));
      for (const f of parte) {
        const foto = fotoDe(f.fotoId);
        const ponerFoto = f.usarFoto && (f.accion === "crear" || !f.existente?.tieneFoto);
        if (foto && ponerFoto) formulario.set(`foto:${f.clave}`, new File([foto.miniatura], "foto", { type: foto.miniatura.type }));
      }
      try {
        const r = await guardarProductosFotoAccion(formulario);
        if (!r.ok) {
          setError(r.error);
          continue;
        }
        const bien = new Set(r.resultados.filter((x) => x.ok).map((x) => x.clave));
        for (const f of parte) {
          if (!bien.has(f.clave)) continue;
          if (f.accion === "crear") creados++;
          else sumados++;
        }
        const errores = new Map(r.resultados.flatMap((x) => (x.ok ? [] : [[x.clave, x.error] as const])));
        setFilas((antes) =>
          antes.filter((f) => !bien.has(f.clave)).map((f) => (errores.has(f.clave) ? { ...f, error: errores.get(f.clave) } : f)),
        );
      } catch {
        setError("Se cortó la conexión mientras guardábamos. Los que quedan en la lista no se guardaron: intenta de nuevo.");
      }
    }
    setGuardando(false);
    if (creados || sumados) {
      setListo({ creados, sumados });
      // Las fotos ya guardadas no hacen falta; las pendientes por leer se quedan.
      setFotos((antes) => antes.filter((f) => f.estado !== "leida"));
    }
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Fotos */}
      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-suave md:p-5">
        <input
          ref={camara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Tomar foto de un producto"
          onChange={(e) => agregarFotos(e.target.files, camara.current)}
        />
        <input
          ref={galeria}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Elegir fotos de la galería"
          onChange={(e) => agregarFotos(e.target.files, galeria.current)}
        />
        <div className="flex flex-wrap items-center gap-3">
          {fotos.map((f) => (
            <div key={f.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt=""
                className={cn(
                  "size-16 rounded-xl border-2 object-cover md:size-[4.5rem]",
                  f.estado === "leida" && "border-emerald-500/60",
                  f.estado === "error" && "border-destructive",
                  f.estado === "leyendo" && "animate-pulse",
                )}
              />
              {f.estado === "leyendo" && (
                <LoaderCircle className="absolute inset-0 m-auto size-6 animate-spin text-white drop-shadow" aria-hidden />
              )}
              {f.estado === "leida" && (
                <CircleCheck className="absolute -right-1.5 -bottom-1.5 size-5 rounded-full bg-card text-emerald-600" aria-label="Leída" />
              )}
              {(f.estado === "pendiente" || f.estado === "error") && !leyendo && (
                <button
                  type="button"
                  onClick={() => quitarFoto(f.id)}
                  className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow"
                  aria-label="Quitar foto"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {preparando > 0 && (
            <div className="flex size-16 items-center justify-center rounded-xl border-2 border-dashed md:size-[4.5rem]">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <button
            type="button"
            onClick={() => camara.current?.click()}
            disabled={leyendo || guardando}
            className="flex h-16 items-center gap-2 rounded-2xl border-2 border-dashed border-primary px-5 text-base font-semibold text-primary disabled:opacity-50 md:h-[4.5rem]"
          >
            <Camera className="size-5" /> {fotos.length ? "Tomar otra foto" : "Tomar foto"}
          </button>
          <Button type="button" variant="ghost" onClick={() => galeria.current?.click()} disabled={leyendo || guardando}>
            <ImageIcon /> Elegir de la galería
          </Button>
          {leidas > 0 && !pendientes.length && (
            <span className="ml-auto flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" /> {leidas === 1 ? "1 foto leída" : `${leidas} fotos leídas`}
            </span>
          )}
        </div>

        {!fotos.length && !filas.length && (
          <p className="text-muted-foreground">
            Toma una foto de cada producto, de frente y con buena luz, que se lea el nombre. También sirve una foto del menú o de una lista de
            precios. Cuando tengas varias, toca <strong>Leer las fotos</strong>.
          </p>
        )}

        {pendientes.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl bg-accent/60 p-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-muted-foreground">
              {leyendo
                ? "Estamos mirando las fotos. Tarda unos 20 segundos por cada 10 fotos; no cierres esta pantalla."
                : `Cada ${FOTOS_POR_TANDA} fotos cuentan como 1 lectura. Te quedan ${quedan} de ${limite} este mes.`}
            </p>
            <Button type="button" size="lg" className="h-14 px-6 text-lg" onClick={leer} disabled={leyendo || preparando > 0}>
              {leyendo ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {leyendo ? "Leyendo…" : pendientes.length === 1 ? "Leer la foto" : `Leer las ${pendientes.length} fotos`}
            </Button>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive">
          <CircleAlert className="mt-0.5 size-5 shrink-0" /> {error}
        </p>
      )}
      {notas.map((n, i) => (
        <p key={i} className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm shadow-suave">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /> {n}
        </p>
      ))}
      {listo && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
            <CircleCheck className="size-5 shrink-0" />
            {[
              listo.creados && (listo.creados === 1 ? "1 producto creado" : `${listo.creados} productos creados`),
              listo.sumados && (listo.sumados === 1 ? "1 sumado al que ya estaba" : `${listo.sumados} sumados a los que ya estaban`),
            ]
              .filter(Boolean)
              .join(" y ")}
            .
          </p>
          <Button asChild variant="outline">
            <Link href="/inventario">Ver el inventario</Link>
          </Button>
        </div>
      )}

      {/* Productos leídos */}
      {filas.map((f) => (
        <Tarjeta
          key={f.clave}
          fila={f}
          foto={fotoDe(f.fotoId)?.url ?? null}
          categorias={categorias}
          deshabilitada={guardando}
          onCambio={(c) => cambiar(f.clave, c)}
          onQuitar={() => quitarFila(f.clave)}
        />
      ))}

      {filas.length > 0 && (
        <div className="sticky bottom-[5.25rem] z-20 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center md:bottom-0 md:mx-0 md:rounded-2xl md:border md:px-5 md:shadow-suave">
          <p className="flex-1 text-muted-foreground">
            {nuevos > 0 && (
              <>
                <strong className="text-foreground">{nuevos === 1 ? "1 nuevo" : `${nuevos} nuevos`}</strong> se crean con su foto
              </>
            )}
            {nuevos > 0 && existentes > 0 && " · "}
            {existentes > 0 && (
              <>
                <strong className="text-foreground">{existentes === 1 ? "1 que ya tienes" : `${existentes} que ya tienes`}</strong> suman al stock
              </>
            )}
          </p>
          <Button
            type="button"
            size="lg"
            onClick={guardar}
            disabled={guardando || leyendo}
            className="h-14 bg-gradient-to-br from-destacado-desde to-destacado-hasta px-8 text-lg font-bold text-white shadow-lg"
          >
            {guardando ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
            {guardando ? "Guardando…" : filas.length === 1 ? "Guardar el producto" : `Guardar los ${filas.length} productos`}
          </Button>
        </div>
      )}
    </div>
  );
}

function Tarjeta({
  fila: f,
  foto,
  categorias,
  deshabilitada,
  onCambio,
  onQuitar,
}: {
  fila: Fila;
  foto: string | null;
  categorias: { id: string; nombre: string }[];
  deshabilitada: boolean;
  onCambio: (c: Partial<Fila>) => void;
  onQuitar: () => void;
}) {
  const teclado = useCampoTeclado();
  const sumando = f.accion === "sumar" && !!f.existente;
  const faltaPrecio = f.error === "Falta el precio de venta.";
  return (
    <article
      className={cn(
        "relative grid gap-4 rounded-2xl border bg-card p-4 shadow-suave md:grid-cols-[10rem_1fr] md:gap-5 md:p-5",
        f.error && "border-destructive/60",
      )}
    >
      <button
        type="button"
        onClick={onQuitar}
        disabled={deshabilitada}
        className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Quitar <X className="size-4" />
      </button>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" className="aspect-[2/1] w-full rounded-xl bg-muted object-cover md:aspect-square md:size-40" />
      ) : (
        <div className="hidden rounded-xl bg-muted md:block md:size-40" />
      )}

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 pr-20">
          {f.existente ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-300">● Ya lo tienes</span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-800 dark:text-emerald-300">● Nuevo</span>
          )}
          {!f.usarFoto && <span className="text-sm text-muted-foreground">Sin foto (salió de un menú o lista)</span>}
        </div>

        <Input
          value={f.nombre}
          onChange={(e) => onCambio({ nombre: e.target.value })}
          aria-label="Nombre del producto"
          disabled={deshabilitada || sumando}
          className="h-12 border-transparent bg-transparent px-0 text-xl font-bold shadow-none focus-visible:border-input focus-visible:px-3 md:text-2xl disabled:opacity-100"
        />

        {sumando ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Campo etiqueta="Precio de venta" className="col-span-2 md:col-span-1">
              <CampoPesos valor={f.precio} onValor={(v) => onCambio({ precio: v })} className="h-14 text-xl font-bold" disabled={deshabilitada} />
            </Campo>
            <Campo etiqueta={f.existente!.controlaStock ? "Sumar al stock" : "No se cuenta"}>
              <Input
                {...teclado}
                value={f.cantidad}
                onChange={(e) => onCambio({ cantidad: e.target.value.replace(/[^\d]/g, "").slice(0, 6) })}
                placeholder="0"
                disabled={deshabilitada || !f.existente!.controlaStock}
                className="h-14 text-xl font-bold"
              />
            </Campo>
            <Campo etiqueta="Hay ahora">
              <div className="flex h-14 items-center rounded-md border bg-muted px-3 text-xl font-bold text-muted-foreground">
                {f.existente!.controlaStock ? Number(f.existente!.stock).toLocaleString("es-CO") : "—"}
              </div>
            </Campo>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1.3fr_1fr_1.2fr]">
            <Campo etiqueta="Precio de venta" className="col-span-2 md:col-span-1" error={faltaPrecio ? "Escribe el precio." : undefined}>
              <CampoPesos
                valor={f.precio}
                onValor={(v) => onCambio({ precio: v })}
                className="h-14 text-xl font-bold"
                aria-invalid={faltaPrecio || undefined}
                disabled={deshabilitada}
              />
            </Campo>
            <Campo etiqueta="Cantidad que hay">
              <Input
                {...teclado}
                value={f.cantidad}
                onChange={(e) => onCambio({ cantidad: e.target.value.replace(/[^\d]/g, "").slice(0, 6) })}
                placeholder="0"
                disabled={deshabilitada}
                className="h-14 text-xl font-bold"
              />
            </Campo>
            <Campo etiqueta="Categoría">
              <NativeSelect
                value={f.categoria}
                onChange={(e) => onCambio({ categoria: e.target.value })}
                disabled={deshabilitada}
                className="h-14 text-base"
              >
                <option value="">Sin categoría</option>
                {f.categoriaNueva && <option value="nueva">{f.categoriaNueva} (nueva)</option>}
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </NativeSelect>
            </Campo>
          </div>
        )}

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Leído en la foto:</span>
          {f.marca && (
            <span>
              Marca <b className="text-foreground">{f.marca}</b>
            </span>
          )}
          <span>
            Código de barras <b className="text-foreground">{f.codigoBarras ?? "no se ve"}</b>
          </span>
          <span>
            Precio en foto <b className="text-foreground">{f.precioVisto ? `$ ${f.precioVisto.toLocaleString("es-CO")}` : "no aparece"}</b>
          </span>
        </p>

        {f.existente && (
          <div className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3 text-amber-900 sm:flex-row sm:items-center dark:text-amber-200">
            <p className="flex-1">
              ⚠️ Ya existe <b>“{f.existente.nombre}”</b> en tu inventario.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={f.accion === "sumar" ? "default" : "outline"}
                className={cn("h-10", f.accion === "sumar" && "bg-amber-700 text-white hover:bg-amber-800")}
                onClick={() => onCambio({ accion: "sumar", precio: f.precio ?? f.existente!.precioVenta })}
                disabled={deshabilitada}
              >
                Sumar al que ya está
              </Button>
              <Button
                type="button"
                size="sm"
                variant={f.accion === "crear" ? "default" : "outline"}
                className={cn("h-10", f.accion === "crear" && "bg-amber-700 text-white hover:bg-amber-800")}
                onClick={() => onCambio({ accion: "crear" })}
                disabled={deshabilitada}
              >
                Crear aparte
              </Button>
            </div>
          </div>
        )}

        {f.error && !faltaPrecio && (
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <CircleAlert className="size-4" /> {f.error}
          </p>
        )}
      </div>
    </article>
  );
}

function Campo({ etiqueta, error, className, children }: { etiqueta: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-muted-foreground">{etiqueta}</span>
      {children}
      {error && <span className="block text-sm font-medium text-destructive">{error}</span>}
    </label>
  );
}
