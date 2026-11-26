"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon, Images, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { achicarFoto } from "@/lib/achicar-foto";
import { guardarFotoAccion } from "../../acciones";

export function FotoProducto({
  productoId,
  fotoUrl,
  talla,
}: {
  productoId: string;
  fotoUrl: string | null;
  /** Si es una talla de una prenda: la foto queda también en las otras tallas del mismo color. */
  talla?: { color: string | null } | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const actual = vista ?? fotoUrl;

  function guardar(blob: Blob | null) {
    setError(null);
    setAviso(null);
    const formulario = new FormData();
    if (blob) formulario.set("foto", new File([blob], "foto", { type: blob.type }));
    iniciar(async () => {
      const r = await guardarFotoAccion(productoId, formulario);
      if (r.error) {
        setError(r.error);
        setVista(null);
      } else {
        if (!blob) setVista(null);
        const otras = (r.ids?.length ?? 1) - 1;
        if (otras > 0) {
          const cuantas = otras === 1 ? "1 talla más" : `${otras} tallas más`;
          setAviso(blob ? `También quedó en ${cuantas} de este color.` : `También se quitó de ${cuantas} de este color.`);
        }
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
      if (camara.current) camara.current.value = "";
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
        <p className="text-sm text-muted-foreground">
          {talla
            ? `Sale en la caja y en el inventario, y queda en todas las tallas${talla.color ? ` de color ${talla.color.toLowerCase()}` : ""}.`
            : "Sale en el botón de la caja y en el inventario. Opcional."}
        </p>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Elegir foto"
          onChange={(ev) => elegir(ev.target.files?.[0])}
        />
        {/* "capture" abre la cámara directo en la tablet y el celular. */}
        <input
          ref={camara}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Tomar foto"
          onChange={(ev) => elegir(ev.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => camara.current?.click()} disabled={guardando}>
            <Camera /> {guardando ? "Guardando…" : "Tomar foto"}
          </Button>
          <Button type="button" variant="outline" onClick={() => entrada.current?.click()} disabled={guardando}>
            <Images /> Galería
          </Button>
          {actual && (
            <Button type="button" variant="ghost" onClick={() => guardar(null)} disabled={guardando}>
              <Trash2 /> Quitar
            </Button>
          )}
        </div>
        {aviso && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{aviso}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
