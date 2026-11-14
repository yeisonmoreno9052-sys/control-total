"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Campo } from "@/components/layout/campo";
import { Input } from "@/components/ui/input";
import { COLORES, dibujarCollage } from "@/lib/estados/dibujar";
import { MAXIMO_COLLAGE, nombreArchivo, textoCollage, type DisenoCollage, type PiezaEstado } from "@/lib/estados/piezas";
import { formatearPesos } from "@/lib/formato";
import type { Paleta } from "@/lib/paletas";
import { cn } from "@/lib/utils";
import { Acciones, Lienzo, useFuentes, useImagenes, useTelefono } from "../comun";

/** Para empezar: las más nuevas que tienen foto (si no hay ninguna con foto, las más nuevas). */
function primeras(piezas: PiezaEstado[]) {
  const conFoto = piezas.filter((p) => p.fotoUrl);
  return (conFoto.length ? conFoto : piezas).slice(0, MAXIMO_COLLAGE).map((p) => p.productoId);
}

export function EditorCollage({
  piezas,
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
  const [elegidas, setElegidas] = useState<string[]>(() => primeras(piezas));
  const [titulo, setTitulo] = useState("Llegó mercancía nueva");
  const [nota, setNota] = useState("Pregunta por tu talla");
  const [telefono, setTelefono] = useTelefono(telefonoNegocio);

  const seleccion = useMemo(
    () => elegidas.map((id) => piezas.find((p) => p.productoId === id)).filter((p): p is PiezaEstado => !!p),
    [elegidas, piezas],
  );
  const imagenes = useImagenes([logoUrl, ...seleccion.map((p) => p.fotoUrl)]);

  const diseno: DisenoCollage = useMemo(
    () => ({
      titulo,
      nota,
      telefono,
      piezas: seleccion.map((p) => ({
        nombre: p.nombre,
        precio: p.precio,
        fotoUrl: p.fotoUrl,
      })),
    }),
    [titulo, nota, telefono, seleccion],
  );

  useEffect(() => {
    const c = lienzo.current?.getContext("2d");
    if (!c || !fuentes) return;
    // Mientras cargan las fotos nuevas, se dibuja con las que ya estén.
    const fotos = seleccion.map((p) => (p.fotoUrl ? (imagenes.get(p.fotoUrl) ?? null) : null));
    const logo = logoUrl ? (imagenes.get(logoUrl) ?? null) : null;
    dibujarCollage(c, diseno, fotos, { logo, marca }, COLORES[paleta], fuentes);
  }, [diseno, seleccion, imagenes, fuentes, logoUrl, marca, paleta]);

  function alternar(id: string) {
    setElegidas((actual) =>
      actual.includes(id) ? actual.filter((x) => x !== id) : actual.length >= MAXIMO_COLLAGE ? actual : [...actual, id],
    );
  }

  const lleno = elegidas.length >= MAXIMO_COLLAGE;

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
          <p className="text-sm text-muted-foreground">Lo último que entró y tiene stock. Toca para poner o quitar.</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {piezas.map((p) => {
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
                    <span className="px-2 pb-1.5 text-xs text-muted-foreground tabular-nums">{formatearPesos(p.precio)}</span>
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

        <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-suave sm:grid-cols-2 md:p-5">
          <Campo id="c-titulo" etiqueta="Título" className="sm:col-span-2">
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

        <Acciones lienzo={lienzo} nombre={nombreArchivo(titulo)} texto={textoCollage(diseno)} listo={!!fuentes} />
      </div>
    </div>
  );
}
