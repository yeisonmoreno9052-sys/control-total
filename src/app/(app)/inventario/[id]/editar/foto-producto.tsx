"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { achicarFoto } from "@/lib/achicar-foto";
import { guardarFotoAccion } from "../../acciones";

export function FotoProducto({ productoId, fotoUrl }: { productoId: string; fotoUrl: string | null }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const actual = vista ?? fotoUrl;

  function guardar(blob: Blob | null) {
    setError(null);
    const formulario = new FormData();
    if (blob) formulario.set("foto", new File([blob], "foto", { type: blob.type }));
    iniciar(async () => {
      const r = await guardarFotoAccion(productoId, formulario);
      if (r.error) {
        setError(r.error);
        setVista(null);
      } else {
        if (!blob) setVista(null);
        router.refresh();
      }
    });
  }

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    try {
      const blob = await achicarFoto(archivo);
      setVista(URL.createObjectURL(blob));
      guardar(blob);
    } catch {
      setError("No pudimos abrir esa imagen. Prueba con otra foto.");
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <section className="mb-6 flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-suave md:p-5">
      <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
        {actual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actual} alt="Foto del producto" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="font-medium">Foto</p>
        <p className="text-sm text-muted-foreground">Sale en el botón de la caja y en el inventario. Opcional.</p>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Elegir foto"
          onChange={(ev) => elegir(ev.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => entrada.current?.click()} disabled={guardando}>
            <Camera /> {guardando ? "Guardando…" : actual ? "Cambiar foto" : "Poner foto"}
          </Button>
          {actual && (
            <Button type="button" variant="ghost" onClick={() => guardar(null)} disabled={guardando}>
              <Trash2 /> Quitar
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
