"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, ImagePlus, X } from "lucide-react";
import { achicarFoto } from "@/lib/achicar-foto";
import { colorMuestra } from "@/lib/catalogo/colores";
import type { GaleriaColor } from "@/lib/datos/fotos-catalogo";
import { agregarFotoCatalogoAccion, quitarFotoCatalogoAccion } from "../../acciones";

/**
 * Fotos extra para el catálogo en línea. La foto que ya tiene la prenda queda como principal;
 * aquí se agregan otras (espalda, detalle, puesta) solo si se quiere.
 */
export function FotosCatalogo({ productoId, galeria, maximo }: { productoId: string; galeria: GaleriaColor[]; maximo: number }) {
  return (
    <section className="mb-6 space-y-4 rounded-2xl border bg-card p-4 shadow-suave md:p-5">
      <div>
        <p className="font-medium">Más fotos para el catálogo en línea</p>
        <p className="text-sm text-muted-foreground">
          La foto que ya tiene queda como principal. Agrega otras (espalda, detalle, puesta) solo si quieres: los clientes las ven
          deslizando el dedo.
        </p>
      </div>
      {galeria.map((g) => (
        <GrupoColor key={g.color ?? "-"} productoId={productoId} grupo={g} maximo={maximo} mostrarColor={galeria.length > 1 || !!g.color} />
      ))}
    </section>
  );
}

function GrupoColor({ productoId, grupo, maximo, mostrarColor }: { productoId: string; grupo: GaleriaColor; maximo: number; mostrarColor: boolean }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const total = (grupo.principal ? 1 : 0) + grupo.extras.length;
  const hex = colorMuestra(grupo.color);

  async function elegir(archivos: FileList | null) {
    setError(null);
    const lista = Array.from(archivos ?? []).slice(0, Math.max(0, maximo - grupo.extras.length));
    if (entrada.current) entrada.current.value = "";
    if (!lista.length) return;
    iniciar(async () => {
      for (const archivo of lista) {
        try {
          const blob = await achicarFoto(archivo);
          const f = new FormData();
          f.set("foto", new File([blob], "foto", { type: blob.type }));
          const r = await agregarFotoCatalogoAccion(productoId, grupo.color, f);
          if (r.error) {
            setError(r.error);
            break;
          }
        } catch {
          setError("No pudimos abrir esa imagen. Prueba con otra foto.");
          break;
        }
      }
      router.refresh();
    });
  }

  function quitar(id: string) {
    setError(null);
    iniciar(async () => {
      const r = await quitarFotoCatalogoAccion(productoId, id);
      if (r.error) setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {mostrarColor && (
        <p className="flex items-center gap-2 text-sm font-semibold">
          {hex && <span className="size-4 rounded-full ring-1 ring-black/15" style={{ background: hex }} />}
          {grupo.color ?? "Sin color"} · {total} {total === 1 ? "foto" : "fotos"}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-muted">
          {grupo.principal ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={grupo.principal} alt="Foto principal" className="size-full object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
              <ImageIcon className="size-6" /> Sin foto principal
            </span>
          )}
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">Principal</span>
        </div>
        {grupo.extras.map((f) => (
          <div key={f.id} className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt="Foto extra" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => quitar(f.id)}
              disabled={guardando}
              aria-label="Quitar esta foto"
              className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-white/95 text-foreground shadow"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {grupo.extras.length < maximo && (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={guardando}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-2 text-center text-sm font-semibold text-primary disabled:opacity-60"
          >
            <ImagePlus className="size-7" />
            {guardando ? "Guardando…" : "Agregar otra foto"}
          </button>
        )}
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label={`Agregar fotos${grupo.color ? ` en ${grupo.color}` : ""}`}
        onChange={(ev) => elegir(ev.target.files)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
