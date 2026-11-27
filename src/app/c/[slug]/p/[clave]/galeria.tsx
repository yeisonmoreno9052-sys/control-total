"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Expand, Maximize2, X } from "lucide-react";

/**
 * Fotos de una prenda: se deslizan con el dedo, abajo van las miniaturas y al tocar una
 * foto se abre en pantalla completa, donde se puede acercar con dos dedos o con doble toque.
 */
export function Galeria({ fotos, nombre, sobreFoto, vacia }: { fotos: string[]; nombre: string; sobreFoto?: ReactNode; vacia: ReactNode }) {
  const carril = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const [grande, setGrande] = useState<number | null>(null);
  const varias = fotos.length > 1;

  const irA = (i: number) => {
    const c = carril.current;
    if (!c) return;
    c.scrollTo({ left: i * c.clientWidth, behavior: "smooth" });
  };

  return (
    <div>
      <div className="relative aspect-[4/5] bg-[var(--ct-suave)] md:overflow-hidden">
        {sobreFoto}
        {fotos.length ? (
          <div
            ref={carril}
            onScroll={(e) => {
              const c = e.currentTarget;
              setActual(Math.round(c.scrollLeft / Math.max(1, c.clientWidth)));
            }}
            className="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {fotos.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setGrande(i)}
                aria-label={`Ver la foto ${i + 1} en grande`}
                className="size-full shrink-0 snap-center snap-always"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- la foto ya viene achicada */}
                <img src={src} alt={`${nombre}, foto ${i + 1}`} loading={i ? "lazy" : "eager"} className="size-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        ) : (
          vacia
        )}
        {fotos.length > 0 && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <span className="bg-black/70 px-2.5 py-1.5 text-[11px] font-medium tracking-[0.14em] text-white">
              {actual + 1} / {fotos.length}
            </span>
            {varias && (
              <span className="flex gap-1" aria-hidden="true">
                {fotos.map((f, i) => (
                  <i key={f} className={`h-[5px] rounded-full transition-all ${i === actual ? "w-4 bg-white" : "w-[5px] bg-white/60"}`} />
                ))}
              </span>
            )}
            <button
              type="button"
              onClick={() => setGrande(actual)}
              className="pointer-events-auto flex items-center gap-1.5 bg-white/92 px-2.5 py-1.5 text-[11px] font-medium text-[#222]"
            >
              <Maximize2 className="size-3.5" aria-hidden="true" /> Ver en grande
            </button>
          </div>
        )}
      </div>
      {varias && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none] md:px-0">
          {fotos.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => irA(i)}
              aria-label={`Ver la foto ${i + 1}`}
              aria-current={i === actual}
              className={`h-[72px] w-[58px] shrink-0 overflow-hidden bg-[var(--ct-suave)] transition ${
                i === actual ? "opacity-100 ring-[1.5px] ring-[var(--ct-acento)] ring-offset-2 ring-offset-[var(--ct-fondo)]" : "opacity-70"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura */}
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {grande !== null && (
        <PantallaCompleta
          fotos={fotos}
          inicial={grande}
          nombre={nombre}
          cerrar={(i) => {
            setGrande(null);
            irA(i);
          }}
        />
      )}
    </div>
  );
}

function PantallaCompleta({ fotos, inicial, nombre, cerrar }: { fotos: string[]; inicial: number; nombre: string; cerrar: (i: number) => void }) {
  const carril = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(inicial);
  const [acercada, setAcercada] = useState(false);
  const [pista, setPista] = useState(true);

  // Empieza en la foto que se tocó, sin que la página de atrás se mueva.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => setPista(false), 3500);
    return () => {
      document.body.style.overflow = antes;
      clearTimeout(t);
    };
  }, []);
  useLayoutEffect(() => {
    const c = carril.current;
    if (c) c.scrollLeft = inicial * c.clientWidth;
  }, [inicial]);

  const salir = useCallback(() => cerrar(actual), [cerrar, actual]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") salir();
      const c = carril.current;
      if (!c || acercada) return;
      if (e.key === "ArrowRight") c.scrollBy({ left: c.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft") c.scrollBy({ left: -c.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [salir, acercada]);

  // Solo se abre después de tocar una foto, así que siempre hay document.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Fotos de ${nombre}`} className="fixed inset-0 z-50 flex flex-col bg-[#060606] text-white">
      <div className="flex h-16 shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)] box-content">
        <button type="button" onClick={salir} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-full bg-white/15">
          <X className="size-5" />
        </button>
        <span className="text-[11px] font-medium tracking-[0.22em]">
          {actual + 1} / {fotos.length}
        </span>
        <span className="size-11" />
      </div>
      <div
        ref={carril}
        onScroll={(e) => {
          const c = e.currentTarget;
          setActual(Math.round(c.scrollLeft / Math.max(1, c.clientWidth)));
        }}
        className={`relative flex min-h-0 flex-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${acercada ? "overflow-hidden" : "overflow-x-auto"}`}
      >
        {fotos.map((src, i) => (
          <div key={src} className="size-full shrink-0 snap-center snap-always overflow-hidden">
            <Acercable src={src} alt={`${nombre}, foto ${i + 1}`} activa={i === actual} alAcercar={setAcercada} />
          </div>
        ))}
      </div>
      {pista && (
        <p className="pointer-events-none absolute inset-x-0 bottom-36 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[12.5px] backdrop-blur">
            <Expand className="size-4" aria-hidden="true" /> Abre dos dedos o toca dos veces para acercar
          </span>
        </p>
      )}
      <p className="shrink-0 pt-3 text-center font-[family-name:var(--ct-serif)] text-xl text-white/90">{nombre}</p>
      <div className="flex shrink-0 justify-center gap-2 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {fotos.length > 1 &&
          fotos.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Ver la foto ${i + 1}`}
              onClick={() => carril.current?.scrollTo({ left: i * carril.current.clientWidth, behavior: "smooth" })}
              className={`h-[68px] w-[54px] overflow-hidden rounded-md transition ${i === actual ? "opacity-100 ring-2 ring-[var(--ct-acentoClaro)]" : "opacity-50"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura */}
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
      </div>
    </div>,
    // Dentro del catálogo, para que tenga sus letras y colores.
    document.getElementById("catalogo-raiz") ?? document.body,
  );
}

type Vista = { s: number; x: number; y: number };
const ZOOM_MAX = 4;
const ZOOM_TOQUE = 2.5;
const SIN_ZOOM: Vista = { s: 1, x: 0, y: 0 };

/** Una foto que se acerca con dos dedos (o doble toque / doble clic) y se mueve con un dedo. */
function Acercable({ src, alt, activa, alAcercar }: { src: string; alt: string; activa: boolean; alAcercar: (si: boolean) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<Vista>({ s: 1, x: 0, y: 0 });
  const vista = useRef(v);
  useEffect(() => {
    vista.current = v;
  }, [v]);
  // Al pasar a otra foto, la anterior vuelve a su tamaño.
  const [eraActiva, setEraActiva] = useState(activa);
  if (eraActiva !== activa) {
    setEraActiva(activa);
    if (!activa) setV(SIN_ZOOM);
  }

  const limitar = useCallback((n: Vista): Vista => {
    const c = caja.current;
    if (!c || n.s <= 1) return { s: 1, x: 0, y: 0 };
    const mx = ((n.s - 1) * c.clientWidth) / 2;
    const my = ((n.s - 1) * c.clientHeight) / 2;
    return { s: n.s, x: Math.max(-mx, Math.min(mx, n.x)), y: Math.max(-my, Math.min(my, n.y)) };
  }, []);

  /** Acerca o aleja dejando quieto el punto tocado. */
  const alternar = useCallback(
    (px: number, py: number) => {
      const c = caja.current;
      if (!c) return;
      if (vista.current.s > 1) return setV({ s: 1, x: 0, y: 0 });
      const r = c.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      setV(limitar({ s: ZOOM_TOQUE, x: -dx * (ZOOM_TOQUE - 1), y: -dy * (ZOOM_TOQUE - 1) }));
    },
    [limitar],
  );

  useEffect(() => {
    alAcercar(activa && v.s > 1);
  }, [activa, v.s, alAcercar]);
  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    let pellizco: { d: number; s: number; x: number; y: number } | null = null;
    let arrastre: { px: number; py: number; x: number; y: number } | null = null;
    let ultimoToque = 0;
    let movio = false;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const inicio = (e: TouchEvent) => {
      movio = false;
      if (e.touches.length === 2) {
        const { s, x, y } = vista.current;
        pellizco = { d: dist(e.touches), s, x, y };
        arrastre = null;
      } else if (e.touches.length === 1 && vista.current.s > 1) {
        arrastre = { px: e.touches[0].clientX, py: e.touches[0].clientY, x: vista.current.x, y: vista.current.y };
      }
    };
    const mover = (e: TouchEvent) => {
      movio = true;
      if (e.touches.length === 2 && pellizco) {
        e.preventDefault();
        const s = Math.max(1, Math.min(ZOOM_MAX, (pellizco.s * dist(e.touches)) / pellizco.d));
        const f = s / pellizco.s;
        setV(limitar({ s, x: pellizco.x * f, y: pellizco.y * f }));
      } else if (e.touches.length === 1 && arrastre && vista.current.s > 1) {
        e.preventDefault();
        setV(limitar({ s: vista.current.s, x: arrastre.x + e.touches[0].clientX - arrastre.px, y: arrastre.y + e.touches[0].clientY - arrastre.py }));
      }
    };
    const fin = (e: TouchEvent) => {
      if (e.touches.length < 2) pellizco = null;
      if (e.touches.length === 1 && vista.current.s > 1) {
        arrastre = { px: e.touches[0].clientX, py: e.touches[0].clientY, x: vista.current.x, y: vista.current.y };
      }
      if (e.touches.length === 0) {
        arrastre = null;
        if (vista.current.s < 1.05) setV({ s: 1, x: 0, y: 0 });
        // Doble toque.
        if (!movio && e.changedTouches.length === 1) {
          const ahora = Date.now();
          if (ahora - ultimoToque < 300) {
            e.preventDefault();
            alternar(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            ultimoToque = 0;
          } else ultimoToque = ahora;
        }
      }
    };
    c.addEventListener("touchstart", inicio, { passive: true });
    c.addEventListener("touchmove", mover, { passive: false });
    c.addEventListener("touchend", fin, { passive: false });
    return () => {
      c.removeEventListener("touchstart", inicio);
      c.removeEventListener("touchmove", mover);
      c.removeEventListener("touchend", fin);
    };
  }, [limitar, alternar]);

  return (
    <div
      ref={caja}
      onDoubleClick={(e) => alternar(e.clientX, e.clientY)}
      className={`flex size-full items-center justify-center ${v.s > 1 ? "touch-none" : "touch-pan-x"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- la foto ya viene achicada */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain transition-transform duration-75 ease-out select-none"
        style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})` }}
      />
    </div>
  );
}
