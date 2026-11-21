"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flashlight, FlashlightOff, ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Formatos de los productos de tienda: EAN/UPC (los de supermercado) y Code 128/39 (etiquetas propias). */
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

type Detector = {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]>;
};
type LectorZxing = { decodeFromCanvas(lienzo: HTMLCanvasElement): { getText(): string } };

/** ZXing (lector en JavaScript) para iPhone y por si el del celular no lee. Se descarga solo cuando hace falta. */
async function crearZxing(): Promise<LectorZxing | null> {
  try {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    const pistas = new Map<unknown, unknown>([
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
        ],
      ],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    return new BrowserMultiFormatReader(pistas as Map<never, never>);
  } catch {
    return null;
  }
}
type DetectorNativo = {
  new (opciones: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/** Android (Chrome) trae su propio lector, rápido y liviano. iPhone no: ahí se usa ZXing. */
async function lectorNativo(): Promise<Detector | null> {
  const Nativo = (window as unknown as { BarcodeDetector?: DetectorNativo }).BarcodeDetector;
  if (!Nativo) return null;
  try {
    const soportados = await Nativo.getSupportedFormats();
    const formatos = FORMATOS.filter((f) => soportados.includes(f));
    return formatos.length ? new Nativo({ formats: formatos }) : null;
  } catch {
    return null;
  }
}

function mensajeDeError(e: unknown) {
  const nombre = e instanceof DOMException ? e.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError")
    return "No tenemos permiso para usar la cámara. Toca el candado junto a la dirección y permite la cámara.";
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError")
    return "Este aparato no tiene cámara disponible.";
  if (nombre === "NotReadableError") return "Otra aplicación está usando la cámara. Ciérrala y vuelve a intentar.";
  return "No pudimos abrir la cámara. Vuelve a intentar.";
}

type Rango = { min: number; max: number; step?: number };
type Capacidades = MediaTrackCapabilities & { zoom?: Rango; torch?: boolean; focusMode?: string[] };
type Controles = { zoom: number | null; zooms: number[]; linterna: boolean | null };

const CLAVE_ZOOM = "escaner-zoom";

/**
 * Deja la cámara lista para códigos de barras (en los celulares que lo permiten):
 * - Enfoque automático continuo, para que enfoque solo al mover el celular.
 * - Zoom de 2x: el celular se puede tener a un palmo y el código se ve grande y nítido.
 *   (De muy cerca la cámara no alcanza a enfocar; con zoom ya no hace falta acercarla.)
 * - Linterna si la cámara tiene.
 */
async function ajustarCamara(pista: MediaStreamTrack, avisar: (c: Controles) => void) {
  const capacidades = (pista.getCapabilities?.() ?? {}) as Capacidades;
  const ajustes: Record<string, unknown> = {};
  if (capacidades.focusMode?.includes("continuous")) ajustes.focusMode = "continuous";

  let zoom: number | null = null;
  let zooms: number[] = [];
  const rango = capacidades.zoom;
  if (rango && rango.max > rango.min) {
    zooms = [1, 2, 3].filter((z) => z >= rango.min && z <= rango.max);
    let guardado = NaN;
    try {
      guardado = Number(localStorage.getItem(CLAVE_ZOOM));
    } catch {
      // Sin almacenamiento: se usa el zoom de siempre.
    }
    zoom = zooms.includes(guardado) ? guardado : Math.min(2, rango.max);
    ajustes.zoom = zoom;
  }
  if (Object.keys(ajustes).length) {
    await pista.applyConstraints({ advanced: [ajustes as MediaTrackConstraintSet] }).catch(() => {
      zoom = zooms.length ? 1 : null;
    });
  }
  avisar({ zoom, zooms, linterna: capacidades.torch ? false : null });
}

/**
 * Pantalla completa con la cámara trasera: apuntas al código de barras y lo lee solo.
 * Al leerlo vibra, se cierra y entrega el código.
 */
export function EscanerCamara({ alLeer, alCerrar }: { alLeer: (codigo: string) => void; alCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [controles, setControles] = useState<Controles | null>(null);
  const pistaRef = useRef<MediaStreamTrack | null>(null);
  const leer = useRef(alLeer);
  useEffect(() => {
    leer.current = alLeer;
  }, [alLeer]);

  useEffect(() => {
    let activo = true;
    let flujo: MediaStream | null = null;
    let espera: ReturnType<typeof setTimeout> | undefined;

    function listo(codigo: string) {
      if (!activo) return;
      activo = false;
      navigator.vibrate?.(80);
      leer.current(codigo.trim());
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("sin cámara");
        flujo = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // Más resolución: el código se lee desde más lejos, sin tener que acercar tanto.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!activo || !video.current) return;
        const v = video.current;
        // iPhone solo reproduce la cámara en la página si el video está en silencio y "en línea".
        v.muted = true;
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.srcObject = flujo;
        await v.play().catch(() => {});
        const pista = flujo.getVideoTracks()[0];
        if (pista) await ajustarCamara(pista, setControles);
        pistaRef.current = pista ?? null;

        // Se lee cuadro por cuadro desde un lienzo propio (no desde el video directo): así
        // funciona igual en iPhone, donde el lector esperaba a la cámara y nunca empezaba.
        const lienzo = document.createElement("canvas");
        const pincel = lienzo.getContext("2d", { willReadFrequently: true });
        const nativo = await lectorNativo();
        let zxing: LectorZxing | null = null;
        let pidiendoZxing = false;
        const pedirZxing = () => {
          if (pidiendoZxing) return;
          pidiendoZxing = true;
          void crearZxing().then((l) => (zxing = l));
        };
        if (!nativo) pedirZxing();
        const inicio = Date.now();
        let vuelta = 0;

        const buscar = async () => {
          if (!activo) return;
          const ancho = v.videoWidth;
          const alto = v.videoHeight;
          if (ancho && alto && pincel) {
            // Una vuelta solo el centro (el recuadro: el código se ve más grande) y otra la imagen completa.
            const centro = vuelta++ % 2 === 0;
            const sw = centro ? ancho * 0.9 : ancho;
            const sh = centro ? Math.min(alto * 0.5, sw * 0.75) : alto;
            const escala = Math.min(1, 1280 / sw);
            lienzo.width = Math.round(sw * escala);
            lienzo.height = Math.round(sh * escala);
            pincel.drawImage(v, (ancho - sw) / 2, (alto - sh) / 2, sw, sh, 0, 0, lienzo.width, lienzo.height);
            if (nativo) {
              try {
                const [hallado] = await nativo.detect(lienzo);
                if (hallado?.rawValue) return listo(hallado.rawValue);
              } catch {
                // Si el lector del celular falla, ZXing sigue intentando.
              }
              // Si en 3 segundos el del celular no ha leído nada, se suma ZXing.
              if (Date.now() - inicio > 3000) pedirZxing();
            }
            if (zxing) {
              try {
                return listo(zxing.decodeFromCanvas(lienzo).getText());
              } catch {
                // Este cuadro no tenía un código legible: se intenta con el siguiente.
              }
            }
          }
          espera = setTimeout(buscar, 100);
        };
        void buscar();
      } catch (e) {
        if (activo) setError(mensajeDeError(e));
      }
    })();

    return () => {
      activo = false;
      clearTimeout(espera);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function cambiarZoom(z: number) {
    const pista = pistaRef.current;
    if (!pista) return;
    pista
      .applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] })
      .then(() => {
        setControles((c) => (c ? { ...c, zoom: z } : c));
        try {
          localStorage.setItem(CLAVE_ZOOM, String(z));
        } catch {
          // No importa si no se guarda.
        }
      })
      .catch(() => {});
  }

  function cambiarLinterna() {
    const pista = pistaRef.current;
    if (!pista || !controles || controles.linterna === null) return;
    const prender = !controles.linterna;
    pista
      .applyConstraints({ advanced: [{ torch: prender } as MediaTrackConstraintSet] })
      .then(() => setControles((c) => (c ? { ...c, linterna: prender } : c)))
      .catch(() => {});
  }

  // Atrás en el celular o Escape en el teclado cierran sin leer.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alCerrar]);

  // Se pinta directo en el body: así cubre toda la pantalla aunque se abra desde un diálogo.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escanear código de barras"
      className="fixed inset-0 z-[100] bg-black"
    >
      <video ref={video} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />

      {!error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-48 w-[min(88vw,30rem)] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
            <div className="absolute inset-0 rounded-2xl border-4 border-white/90" />
            <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-red-500" />
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <p className="flex items-center gap-2 text-lg font-medium">
          <ScanBarcode className="size-6" /> Apunta al código de barras
        </p>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-12 shrink-0 rounded-full"
          onClick={alCerrar}
          aria-label="Cerrar cámara"
        >
          <X className="size-6" />
        </Button>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        {error ? (
          <div className="mx-auto max-w-md space-y-3 rounded-2xl bg-card p-5 text-card-foreground">
            <p role="alert">{error}</p>
            <Button type="button" size="lg" className="w-full" onClick={alCerrar}>
              Volver
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {controles && (controles.zooms.length > 1 || controles.linterna !== null) && (
              <div className="flex items-center justify-center gap-3">
                {controles.zooms.length > 1 &&
                  controles.zooms.map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => cambiarZoom(z)}
                      aria-pressed={controles.zoom === z}
                      className={cn(
                        "size-14 rounded-full text-lg font-semibold backdrop-blur",
                        controles.zoom === z ? "bg-white text-black" : "bg-black/50 text-white",
                      )}
                    >
                      {z}x
                    </button>
                  ))}
                {controles.linterna !== null && (
                  <button
                    type="button"
                    onClick={cambiarLinterna}
                    aria-pressed={controles.linterna}
                    aria-label={controles.linterna ? "Apagar linterna" : "Prender linterna"}
                    className={cn(
                      "flex size-14 items-center justify-center rounded-full backdrop-blur",
                      controles.linterna ? "bg-amber-300 text-black" : "bg-black/50 text-white",
                    )}
                  >
                    {controles.linterna ? <Flashlight className="size-6" /> : <FlashlightOff className="size-6" />}
                  </button>
                )}
              </div>
            )}
            <p className="text-white/85">
              Lo lee solo. Ponlo a un palmo del código
              {controles?.zooms.length ? "; si queda borroso, cambia el zoom" : ""}.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** true en celular y tablet (dedo). En el computador está el lector USB y el botón sobra. */
export function useTactil() {
  const [tactil, setTactil] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia("(pointer: coarse)");
    const ver = () => setTactil(consulta.matches);
    ver();
    consulta.addEventListener("change", ver);
    return () => consulta.removeEventListener("change", ver);
  }, []);
  return tactil;
}

/** Botón "Escanear" (solo en pantallas táctiles) que abre la cámara y entrega el código leído. */
export function BotonEscanear({
  alLeer,
  className,
  texto = "Escanear",
}: {
  alLeer: (codigo: string) => void;
  className?: string;
  texto?: string;
}) {
  const tactil = useTactil();
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  if (!tactil) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn("h-12 shrink-0 px-3 text-base", className)}
        onClick={() => setAbierto(true)}
        aria-label="Escanear código de barras con la cámara"
      >
        <ScanBarcode className="size-5" /> {texto}
      </Button>
      {abierto && (
        <EscanerCamara
          alCerrar={cerrar}
          alLeer={(codigo) => {
            setAbierto(false);
            alLeer(codigo);
          }}
        />
      )}
    </>
  );
}
