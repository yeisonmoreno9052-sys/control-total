"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Check, ChevronRight, ExternalLink, ImageIcon, Images, Loader2, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { achicarFoto } from "@/lib/achicar-foto";
import { colorMuestra } from "@/lib/catalogo/colores";
import { CONSEJOS, type Revision } from "@/lib/retoque/calidad";
import { prepararRetoque, retocarFoto, revisarFoto } from "@/lib/retoque/retoque";
import { cn } from "@/lib/utils";
import { agregarFotoCatalogoAccion, guardarFotoAccion } from "../../acciones";

type Paso = { id: string; titulo: string; texto: string };

const FRENTE: Paso = { id: "frente", titulo: "Frente", texto: "La prenda completa, de frente y bien estirada." };
const EXTRAS: Paso[] = [
  { id: "espalda", titulo: "Espalda", texto: "Voltéala y tómala completa por detrás." },
  { id: "detalle", titulo: "Detalle", texto: "Acércate a lo más lindo: la tela, un botón, el bordado." },
  { id: "puesta", titulo: "Puesta o en gancho", texto: "Así se imaginan cómo les queda." },
  { id: "otra", titulo: "Otra foto", texto: "Otro ángulo que la luzca." },
];

type Fase =
  | { tipo: "elegir" }
  | { tipo: "revisando" }
  | { tipo: "aviso"; problema: NonNullable<Revision["problema"]> }
  | { tipo: "retocando" }
  | { tipo: "comparar"; retocada: { blob: Blob; url: string } | null }
  | { tipo: "guardando" };

export function SesionFotos({
  productoId,
  nombre,
  color,
  principal,
  extras,
  maximo,
  otrosColores,
  siguiente,
  verEnCatalogo,
}: {
  productoId: string;
  nombre: string;
  color: string | null;
  principal: string | null;
  extras: number;
  maximo: number;
  otrosColores: { productoId: string; color: string; fotos: number }[];
  siguiente: string | null;
  verEnCatalogo: string;
}) {
  // Si no tiene foto principal se empieza por el frente; las demás llenan el cupo de extras.
  // Se fijan al abrir: al guardar cada foto la página se refresca y no deben correrse.
  const [pasos] = useState(() => [...(principal ? [] : [FRENTE]), ...EXTRAS.slice(Math.min(extras, EXTRAS.length), maximo)]);
  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState<Fase>({ tipo: "elegir" });
  const [original, setOriginal] = useState<{ archivo: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardadas, setGuardadas] = useState<{ paso: string; url: string }[]>([]);
  const imagen = useRef<ImageBitmap | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const paso = pasos[indice];
  const hex = colorMuestra(color);

  // El motor del retoque se descarga mientras ella acomoda la prenda.
  useEffect(() => {
    prepararRetoque().catch(() => {});
  }, []);

  function limpiar() {
    imagen.current?.close();
    imagen.current = null;
    setOriginal(null);
    setFase({ tipo: "elegir" });
  }

  function avanzar() {
    limpiar();
    setError(null);
    setIndice((i) => i + 1);
  }

  async function alElegir(archivos: FileList | null) {
    const archivo = archivos?.[0];
    if (camara.current) camara.current.value = "";
    if (galeria.current) galeria.current.value = "";
    if (!archivo) return;
    setError(null);
    setFase({ tipo: "revisando" });
    try {
      imagen.current?.close();
      imagen.current = await createImageBitmap(archivo);
    } catch {
      setError("No pudimos abrir esa imagen. Prueba con otra foto.");
      setFase({ tipo: "elegir" });
      return;
    }
    setOriginal({ archivo, url: URL.createObjectURL(archivo) });
    const revision = revisarFoto(imagen.current);
    if (revision.problema) setFase({ tipo: "aviso", problema: revision.problema });
    else await retocar();
  }

  async function retocar() {
    if (!imagen.current) return;
    setFase({ tipo: "retocando" });
    let blob: Blob | null = null;
    try {
      blob = await retocarFoto(imagen.current);
    } catch {
      blob = null;
    }
    setFase({ tipo: "comparar", retocada: blob ? { blob, url: URL.createObjectURL(blob) } : null });
  }

  async function guardar(blob: Blob | null) {
    if (!original || !paso) return;
    setFase({ tipo: "guardando" });
    setError(null);
    try {
      const final = blob ?? (await achicarFoto(original.archivo));
      const f = new FormData();
      f.set("foto", new File([final], "foto", { type: final.type }));
      const r = paso.id === "frente" ? await guardarFotoAccion(productoId, f) : await agregarFotoCatalogoAccion(productoId, color, f);
      if (r.error) {
        setError(r.error);
        setFase({ tipo: "elegir" });
        return;
      }
      setGuardadas((g) => [...g, { paso: paso.titulo, url: URL.createObjectURL(final) }]);
      avanzar();
    } catch {
      setError("No se pudo guardar la foto. Revisa el internet e inténtalo otra vez.");
      setFase({ tipo: "elegir" });
    }
  }

  const encabezado = (
    <div className="mb-5 space-y-3">
      <Link href="/inventario/fotos-catalogo" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Fotos del catálogo
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{nombre}</h1>
        {color && (
          <p className="mt-1 flex items-center gap-2 text-muted-foreground">
            {hex && <span className="size-4 rounded-full ring-1 ring-black/15" style={{ background: hex }} />}
            {color}
          </p>
        )}
      </div>
      {pasos.length > 0 && (
        <ol className="flex gap-1.5" aria-label="Pasos">
          {pasos.map((p, i) => (
            <li
              key={p.id}
              className={cn("h-1.5 flex-1 rounded-full", i < indice ? "bg-primary" : i === indice ? "bg-primary/50" : "bg-muted")}
              aria-current={i === indice ? "step" : undefined}
              title={p.titulo}
            />
          ))}
        </ol>
      )}
    </div>
  );

  // Fin de la sesión (o ya no cabían más fotos).
  if (!paso) {
    return (
      <div className="mx-auto max-w-md">
        {encabezado}
        <div className="space-y-4 rounded-2xl border bg-card p-5 text-center shadow-suave">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-7" />
          </span>
          <div className="space-y-1">
            <p className="text-lg font-semibold">
              {guardadas.length ? `¡Listo! ${guardadas.length} ${guardadas.length === 1 ? "foto nueva" : "fotos nuevas"}` : "Esta prenda ya tiene todas sus fotos"}
            </p>
            <p className="text-sm text-muted-foreground">Tus clientes ya las ven en el catálogo deslizando el dedo.</p>
          </div>
          {guardadas.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {guardadas.map((g) => (
                <figure key={g.url} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt={g.paso} className="aspect-[4/5] w-full rounded-lg object-cover" />
                  <figcaption className="text-[11px] text-muted-foreground">{g.paso}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <div className="space-y-2 pt-1">
            {otrosColores.map((o) => (
              <Button key={o.productoId} asChild variant={siguiente ? "outline" : "default"} className="h-12 w-full text-base">
                <Link href={`/inventario/fotos-catalogo/${o.productoId}`}>
                  Hacer el color {o.color} <ChevronRight />
                </Link>
              </Button>
            ))}
            {siguiente && (
              <Button asChild className="h-12 w-full text-base">
                <Link href={`/inventario/fotos-catalogo/${siguiente}`}>
                  Siguiente prenda <ChevronRight />
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" className="w-full">
              <a href={verEnCatalogo} target="_blank" rel="noreferrer">
                Ver cómo quedó en el catálogo <ExternalLink />
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      {encabezado}
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-suave">
        <div>
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">
            Foto {indice + 1} de {pasos.length}
          </p>
          <p className="text-xl font-semibold">{paso.titulo}</p>
          <p className="text-muted-foreground">{paso.texto}</p>
        </div>

        {(fase.tipo === "elegir" || fase.tipo === "revisando") && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => camara.current?.click()}
              disabled={fase.tipo === "revisando"}
              className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 text-primary disabled:opacity-70"
            >
              {fase.tipo === "revisando" ? <Loader2 className="size-12 animate-spin" /> : <Camera className="size-12" />}
              <span className="text-lg font-semibold">{fase.tipo === "revisando" ? "Revisando la foto…" : "Tomar la foto"}</span>
              <span className="max-w-60 text-sm text-muted-foreground">Ponla sobre una superficie lisa, con buena luz. El fondo lo arreglamos nosotros.</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-12" onClick={() => galeria.current?.click()} disabled={fase.tipo === "revisando"}>
                <Images /> De la galería
              </Button>
              <Button type="button" variant="ghost" className="h-12" onClick={avanzar} disabled={fase.tipo === "revisando"}>
                Saltar esta
              </Button>
            </div>
          </div>
        )}

        {fase.tipo === "aviso" && original && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={original.url} alt="La foto que tomaste" className="aspect-[4/5] w-full rounded-2xl bg-muted object-contain" />
            <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">{CONSEJOS[fase.problema].titulo}</p>
                <p className="text-sm">{CONSEJOS[fase.problema].texto}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" className="h-12" onClick={() => camara.current?.click()}>
                <RotateCcw /> Tomarla otra vez
              </Button>
              <Button type="button" variant="outline" className="h-12" onClick={retocar}>
                Usarla así
              </Button>
            </div>
          </div>
        )}

        {fase.tipo === "retocando" && original && (
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={original.url} alt="" className="size-full object-contain opacity-60 blur-[2px]" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/25 text-white">
              <Sparkles className="size-10 animate-pulse" />
              <p className="text-lg font-semibold drop-shadow">Dejándola elegante…</p>
              <p className="text-sm drop-shadow">La primera vez tarda un poquito más.</p>
            </div>
          </div>
        )}

        {fase.tipo === "comparar" && original && (
          <div className="space-y-3">
            {fase.retocada ? (
              <>
                <AntesDespues antes={original.url} despues={fase.retocada.url} />
                <p className="text-center text-sm text-muted-foreground">Fondo de estudio, centrada y con mejor luz.</p>
                <Button type="button" className="h-12 w-full text-base" onClick={() => guardar(fase.retocada!.blob)}>
                  <Sparkles /> Usar la retocada
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-12" onClick={() => guardar(null)}>
                    Usar la original
                  </Button>
                  <Button type="button" variant="ghost" className="h-12" onClick={() => camara.current?.click()}>
                    <RotateCcw /> Otra vez
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={original.url} alt="La foto que tomaste" className="aspect-[4/5] w-full rounded-2xl bg-muted object-contain" />
                <p className="rounded-xl bg-muted p-3 text-sm">
                  En esta foto no pudimos separar la prenda del fondo (pasa en las fotos muy de cerca). Se puede guardar tal como está.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" className="h-12" onClick={() => guardar(null)}>
                    Guardarla así
                  </Button>
                  <Button type="button" variant="outline" className="h-12" onClick={() => camara.current?.click()}>
                    <RotateCcw /> Otra vez
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {fase.tipo === "guardando" && (
          <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-muted text-muted-foreground">
            <Loader2 className="size-10 animate-spin" />
            <p className="font-semibold">Guardando…</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {principal && indice === 0 && fase.tipo === "elegir" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={principal} alt="" className="size-10 rounded-lg object-cover" />
          La foto que ya tiene queda como principal.
        </p>
      )}
      {!principal && indice === 0 && fase.tipo === "elegir" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="size-4" /> Esta prenda todavía no tiene foto: la de frente será la principal.
        </p>
      )}

      <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Tomar la foto" onChange={(e) => alElegir(e.target.files)} />
      <input ref={galeria} type="file" accept="image/*" className="sr-only" aria-label="Elegir de la galería" onChange={(e) => alElegir(e.target.files)} />
    </div>
  );
}

/** Antes y después, una al lado de la otra. */
function AntesDespues({ antes, despues }: { antes: string; despues: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          ["Antes", antes],
          ["Después", despues],
        ] as const
      ).map(([titulo, url]) => (
        <figure key={titulo} className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={titulo} className="size-full object-cover" />
          <figcaption
            className={cn(
              "absolute top-1.5 left-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              titulo === "Antes" ? "bg-black/60 text-white" : "bg-primary text-primary-foreground",
            )}
          >
            {titulo}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
