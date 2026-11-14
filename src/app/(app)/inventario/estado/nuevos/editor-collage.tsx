"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Campo } from "@/components/layout/campo";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { COLORES, dibujarCollage } from "@/lib/estados/dibujar";
import {
  aplicarDescuento,
  MAXIMO_COLLAGE,
  nombreArchivo,
  porcentajeRebaja,
  textoCollage,
  type DisenoCollage,
  type PiezaEstado,
} from "@/lib/estados/piezas";
import { formatearPesos } from "@/lib/formato";
import type { Paleta } from "@/lib/paletas";
import { cn } from "@/lib/utils";
import { buscarPiezasAccion } from "../acciones";
import { Acciones, Lienzo, useFuentes, useImagenes, useTelefono } from "../comun";

/** Para empezar: las más nuevas que tienen foto (si no hay ninguna con foto, las más nuevas). */
function primeras(piezas: PiezaEstado[]) {
  const conFoto = piezas.filter((p) => p.fotoUrl);
  return (conFoto.length ? conFoto : piezas).slice(0, MAXIMO_COLLAGE).map((p) => p.productoId);
}

/** Precio y promoción que se ponen solo para la imagen (no cambian el inventario). */
type Ajuste = { precio: number | null; oferta: number | null };

export function EditorCollage({
  piezas: novedades,
  marca,
  logoUrl,
  paleta,
  telefono: telefonoNegocio,
}: {
  piezas: PiezaEstado[];
  marca: string;
  logoUrl: string | null;
  paleta: Paleta;
  telefono: string | null;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const fuentes = useFuentes();
  // Todas las prendas que se han visto (novedades + búsquedas), para no perder las escogidas.
  const [conocidas, setConocidas] = useState(() => new Map(novedades.map((p) => [p.productoId, p])));
  const [elegidas, setElegidas] = useState<string[]>(() => primeras(novedades));
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [descuento, setDescuento] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("Llegó mercancía nueva");
  const [nota, setNota] = useState("Pregunta por tu talla");
  const [telefono, setTelefono] = useTelefono(telefonoNegocio);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<PiezaEstado[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  // Buscar en el servidor un momento después de dejar de escribir.
  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) return;
    let vivo = true;
    const espera = setTimeout(async () => {
      const lista = await buscarPiezasAccion(texto).catch(() => []);
      if (!vivo) return;
      setBuscando(false);
      setResultados(lista);
      setConocidas((m) => {
        const nuevo = new Map(m);
        for (const p of lista) if (!nuevo.has(p.productoId)) nuevo.set(p.productoId, p);
        return nuevo;
      });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [busqueda]);

  const seleccion = useMemo(
    () => elegidas.map((id) => conocidas.get(id)).filter((p): p is PiezaEstado => !!p),
    [elegidas, conocidas],
  );
  const imagenes = useImagenes([logoUrl, ...seleccion.map((p) => p.fotoUrl)]);

  const diseno: DisenoCollage = useMemo(
    () => ({
      titulo,
      nota,
      telefono,
      piezas: seleccion.map((p) => {
        const a = ajustes[p.productoId];
        const precio = a?.precio ?? p.precio;
        return { nombre: p.nombre, precio, oferta: a?.oferta ?? aplicarDescuento(precio, descuento), fotoUrl: p.fotoUrl };
      }),
    }),
    [titulo, nota, telefono, seleccion, ajustes, descuento],
  );

  useEffect(() => {
    const c = lienzo.current?.getContext("2d");
    if (!c || !fuentes) return;
    // Mientras cargan las fotos nuevas, se dibuja con las que ya estén.
    const fotos = seleccion.map((p) => (p.fotoUrl ? (imagenes.get(p.fotoUrl) ?? null) : null));
    const logo = logoUrl ? (imagenes.get(logoUrl) ?? null) : null;
    dibujarCollage(c, diseno, fotos, { logo, marca }, COLORES[paleta], fuentes);
  }, [diseno, seleccion, imagenes, fuentes, logoUrl, marca, paleta]);

  function buscar(texto: string) {
    setBusqueda(texto);
    const corto = texto.trim().length < 2;
    setBuscando(!corto);
    if (corto) setResultados(null);
  }

  function alternar(id: string) {
    setElegidas((actual) =>
      actual.includes(id) ? actual.filter((x) => x !== id) : actual.length >= MAXIMO_COLLAGE ? actual : [...actual, id],
    );
  }

  function ajustar(id: string, cambio: Partial<Ajuste>) {
    setAjustes((a) => ({ ...a, [id]: { ...{ precio: null, oferta: null }, ...a[id], ...cambio } }));
  }

  const lleno = elegidas.length >= MAXIMO_COLLAGE;
  const lista = resultados ?? novedades;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
      <Lienzo lienzo={lienzo} listo={!!fuentes} />

      <div className="space-y-5">
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-suave md:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Prendas</h2>
            <p className="text-sm text-muted-foreground">
              {elegidas.length} de {MAXIMO_COLLAGE}
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => buscar(e.target.value)}
              placeholder="Buscar cualquier prenda por nombre o código"
              aria-label="Buscar prenda"
              className="pr-9 pl-9"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => buscar("")}
                aria-label="Borrar búsqueda"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {resultados
              ? buscando
                ? "Buscando…"
                : resultados.length
                  ? `${resultados.length} encontradas. Toca para poner o quitar.`
                  : "No encontramos prendas con ese nombre."
              : "Lo último que entró y tiene stock. Toca para poner o quitar, o busca otra."}
          </p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {lista.map((p) => {
              const orden = elegidas.indexOf(p.productoId);
              const elegida = orden >= 0;
              return (
                <li key={p.productoId}>
                  <button
                    type="button"
                    onClick={() => alternar(p.productoId)}
                    aria-pressed={elegida}
                    disabled={!elegida && lleno}
                    className={cn(
                      "relative flex w-full flex-col overflow-hidden rounded-xl border bg-background text-left transition",
                      elegida ? "border-primary ring-2 ring-primary" : "hover:border-primary/50",
                      !elegida && lleno && "opacity-40",
                    )}
                  >
                    <span className="flex aspect-square w-full items-center justify-center bg-muted text-3xl font-semibold text-muted-foreground">
                      {p.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.fotoUrl} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        p.nombre.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="truncate px-2 pt-1.5 text-xs font-medium">{p.nombre}</span>
                    <span className="px-2 pb-1.5 text-xs text-muted-foreground tabular-nums">
                      {formatearPesos(p.precio)}
                      {!p.tallas.length && " · sin stock"}
                    </span>
                    {elegida && (
                      <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {orden + 1}
                      </span>
                    )}
                    {!elegida && !p.fotoUrl && (
                      <span className="absolute top-1.5 left-1.5 rounded bg-background/90 px-1.5 text-[10px] text-muted-foreground">
                        Sin foto
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {lleno && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4" /> Ya escogiste 6. Quita una para poner otra.
            </p>
          )}
        </section>

        {seleccion.length > 0 && (
          <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-suave md:p-5">
            <div className="space-y-1">
              <h2 className="font-semibold">Precios y promoción</h2>
              <p className="text-sm text-muted-foreground">
                Solo cambian la imagen. El precio en la caja sigue igual. Con promoción, el precio normal sale tachado.
              </p>
            </div>
            <Campo
              id="c-descuento"
              etiqueta="Descuento para todas (opcional)"
              ayuda="Ej.: 20 para 20 % menos. Se redondea a los $100."
            >
              <div className="relative max-w-40">
                <Input
                  id="c-descuento"
                  inputMode="numeric"
                  value={descuento ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, "").slice(0, 2));
                    setDescuento(n > 0 ? n : null);
                  }}
                  className="pr-8"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </Campo>
            <ul className="divide-y rounded-xl border">
              {seleccion.map((p, i) => {
                const pieza = diseno.piezas[i];
                const rebaja = pieza.oferta !== null ? porcentajeRebaja(pieza.precio, pieza.oferta) : null;
                return (
                  <li key={p.productoId} className="grid gap-3 p-3 sm:grid-cols-[1fr_9rem_9rem] sm:items-end">
                    <div className="flex min-w-0 items-center gap-2 self-center">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      <p className="min-w-0 truncate font-medium">{p.nombre}</p>
                      {rebaja && <span className="shrink-0 text-sm font-semibold text-destructive">-{rebaja} %</span>}
                    </div>
                    <Campo id={`c-precio-${i}`} etiqueta="Precio">
                      <CampoPesos
                        id={`c-precio-${i}`}
                        valor={pieza.precio}
                        onValor={(v) => ajustar(p.productoId, { precio: v })}
                      />
                    </Campo>
                    <Campo id={`c-oferta-${i}`} etiqueta="Promoción">
                      <CampoPesos
                        id={`c-oferta-${i}`}
                        valor={pieza.oferta}
                        placeholder="Sin promoción"
                        onValor={(v) => ajustar(p.productoId, { oferta: v })}
                      />
                    </Campo>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-suave sm:grid-cols-2 md:p-5">
          <Campo
            id="c-titulo"
            etiqueta="Título"
            ayuda="Ej.: Llegó mercancía nueva · Promoción de fin de mes"
            className="sm:col-span-2"
          >
            <Input id="c-titulo" value={titulo} maxLength={40} onChange={(e) => setTitulo(e.target.value)} />
          </Campo>
          <Campo id="c-nota" etiqueta="Frase de abajo (opcional)" ayuda="Ej.: Tallas de la S a la XL · Pregunta por tu talla">
            <Input id="c-nota" value={nota} maxLength={60} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          <Campo
            id="c-telefono"
            etiqueta="WhatsApp para pedidos"
            ayuda={telefonoNegocio ? "Es el teléfono del negocio." : "Queda guardado en este equipo. Vacío: no sale el botón."}
          >
            <Input
              id="c-telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              maxLength={30}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Campo>
        </section>

        <Acciones
          lienzo={lienzo}
          nombre={nombreArchivo(titulo)}
          texto={textoCollage(diseno)}
          listo={!!fuentes}
          version={`${JSON.stringify(diseno)}|${imagenes.size}`}
        />
      </div>
    </div>
  );
}
