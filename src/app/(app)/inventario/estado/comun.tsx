"use client";

import { useEffect, useRef, useState } from "react";
import { Playfair_Display } from "next/font/google";
import { Camera, Check, Copy, Download, Images, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { achicarFoto } from "@/lib/achicar-foto";
import { aArchivo, ALTO, ANCHO, cargarImagen, type Fuentes } from "@/lib/estados/dibujar";
import { guardarFotoEstadoAccion } from "./acciones";

// Letra elegante para los títulos y precios del Estado (solo se descarga en esta pantalla).
const letraTitulo = Playfair_Display({
  subsets: ["latin"],
  weight: ["700"],
  style: ["normal", "italic"],
});

/** Espera a que las letras estén listas: el canvas no las carga solo. */
export function useFuentes() {
  const [fuentes, setFuentes] = useState<Fuentes | null>(null);
  useEffect(() => {
    let vivo = true;
    const titulo = letraTitulo.style.fontFamily;
    const texto = getComputedStyle(document.body).fontFamily;
    const cargas = [
      `700 80px ${titulo}`,
      `italic 700 80px ${titulo}`,
      `400 40px ${texto}`,
      `600 40px ${texto}`,
      `700 40px ${texto}`,
      `800 40px ${texto}`,
    ].map((f) => document.fonts.load(f).catch(() => null));
    Promise.all(cargas).then(() => vivo && setFuentes({ titulo, texto }));
    return () => {
      vivo = false;
    };
  }, []);
  return fuentes;
}

/** Imágenes ya cargadas (por dirección), para no pedirlas cada vez que se redibuja. */
export function useImagenes(urls: (string | null)[]) {
  const cache = useRef(new Map<string, Promise<HTMLImageElement | null>>());
  const [imagenes, setImagenes] = useState<ReadonlyMap<string, HTMLImageElement | null>>(new Map());
  const clave = urls.filter(Boolean).join("|");
  useEffect(() => {
    let vivo = true;
    const lista = [...new Set(urls.filter((u): u is string => !!u))];
    Promise.all(
      lista.map((u) => {
        if (!cache.current.has(u)) cache.current.set(u, cargarImagen(u));
        return cache.current.get(u)!.then((img) => [u, img] as const);
      }),
    ).then((pares) => vivo && setImagenes(new Map(pares)));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return imagenes;
}

const CLAVE_TELEFONO = "estado-telefono";

/** El teléfono del negocio o, si no tiene, el último que se escribió en este equipo. */
export function useTelefono(delNegocio: string | null) {
  const [telefono, setTelefono] = useState(delNegocio ?? "");
  useEffect(() => {
    if (delNegocio) return;
    try {
      const guardado = localStorage.getItem(CLAVE_TELEFONO);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado) setTelefono(guardado);
    } catch {}
  }, [delNegocio]);
  function cambiar(valor: string) {
    setTelefono(valor);
    try {
      localStorage.setItem(CLAVE_TELEFONO, valor);
    } catch {}
  }
  return [telefono, cambiar] as const;
}

/** Vista previa: el canvas real (1080 × 1920) mostrado en pequeño. */
export function Lienzo({ lienzo, listo }: { lienzo: React.RefObject<HTMLCanvasElement | null>; listo: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[17rem] sm:max-w-[22rem] lg:sticky lg:top-6">
      <canvas
        ref={lienzo}
        width={ANCHO}
        height={ALTO}
        className="aspect-[9/16] w-full rounded-2xl border bg-neutral-900 shadow-suave"
        aria-label="Vista previa del Estado"
      />
      {!listo && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Preparando la imagen…</p>}
    </div>
  );
}

/** Compartir (celular), descargar y copiar el texto. */
export function Acciones({
  lienzo,
  nombre,
  texto,
  listo,
}: {
  lienzo: React.RefObject<HTMLCanvasElement | null>;
  nombre: string;
  texto: string;
  listo: boolean;
}) {
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const prueba = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPuedeCompartir(!!navigator.canShare?.({ files: [prueba] }));
    } catch {}
  }, []);

  async function archivo() {
    if (!lienzo.current) return null;
    return aArchivo(lienzo.current, nombre);
  }

  async function compartir() {
    setError(null);
    const f = await archivo();
    if (!f) return setError("No pudimos armar la imagen. Intenta de nuevo.");
    try {
      await navigator.share({ files: [f], text: texto });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setError("No se pudo compartir. Usa Descargar imagen.");
    }
  }

  async function descargar() {
    setError(null);
    const f = await archivo();
    if (!f) return setError("No pudimos armar la imagen. Intenta de nuevo.");
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {puedeCompartir && (
          <Button type="button" size="lg" className="h-14 text-base sm:col-span-2" onClick={compartir} disabled={!listo}>
            <Share2 /> Compartir en WhatsApp
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          variant={puedeCompartir ? "outline" : "default"}
          className="h-12"
          onClick={descargar}
          disabled={!listo}
        >
          <Download /> Descargar imagen
        </Button>
        <Button type="button" size="lg" variant="outline" className="h-12" onClick={copiar}>
          {copiado ? <Check /> : <Copy />} {copiado ? "Texto copiado" : "Copiar texto"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {puedeCompartir
          ? "Toca Compartir, elige WhatsApp y luego «Mi estado». El texto queda copiado para pegarlo si quieres."
          : "Descarga la imagen y súbela a tu Estado desde el celular o desde WhatsApp Web (pestaña Estados)."}
      </p>
      <details className="rounded-xl border bg-card p-3 text-sm shadow-suave">
        <summary className="cursor-pointer font-medium">Ver el texto</summary>
        <pre className="mt-2 font-sans whitespace-pre-wrap text-muted-foreground">{texto}</pre>
      </details>
    </div>
  );
}

/** Tomar o elegir la foto desde esta pantalla. Queda guardada en el producto. */
export function SubirFoto({
  productoId,
  hayFoto,
  onFoto,
}: {
  productoId: string;
  hayFoto: boolean;
  onFoto: (url: string) => void;
}) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setGuardando(true);
    try {
      // Más grande que la de la caja para que en el Estado no se vea borrosa.
      const blob = await achicarFoto(archivo, 900);
      onFoto(URL.createObjectURL(blob));
      const formulario = new FormData();
      formulario.set("foto", new File([blob], "foto", { type: blob.type }));
      const r = await guardarFotoEstadoAccion(productoId, formulario);
      if (r.error) setError(r.error);
    } catch {
      setError("No pudimos abrir esa imagen. Prueba con otra foto.");
    } finally {
      setGuardando(false);
      if (camara.current) camara.current.value = "";
      if (galeria.current) galeria.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Elegir foto"
        onChange={(e) => elegir(e.target.files?.[0])}
      />
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Tomar foto"
        onChange={(e) => elegir(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={hayFoto ? "outline" : "default"}
          onClick={() => camara.current?.click()}
          disabled={guardando}
        >
          <Camera /> {guardando ? "Guardando…" : hayFoto ? "Cambiar foto" : "Tomar foto"}
        </Button>
        <Button type="button" variant="outline" onClick={() => galeria.current?.click()} disabled={guardando}>
          <Images /> Galería
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
