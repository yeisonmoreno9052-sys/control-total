"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Formatos de los productos de tienda: EAN/UPC (los de supermercado) y Code 128/39 (etiquetas propias). */
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

type Detector = {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
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

/**
 * Pantalla completa con la cámara trasera: apuntas al código de barras y lo lee solo.
 * Al leerlo vibra, se cierra y entrega el código.
 */
export function EscanerCamara({ alLeer, alCerrar }: { alLeer: (codigo: string) => void; alCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const leer = useRef(alLeer);
  useEffect(() => {
    leer.current = alLeer;
  }, [alLeer]);

  useEffect(() => {
    let activo = true;
    let flujo: MediaStream | null = null;
    let detenerZxing: (() => void) | null = null;
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
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (!activo || !video.current) return;
        const v = video.current;
        v.srcObject = flujo;
        await v.play().catch(() => {});

        const nativo = await lectorNativo();
        if (nativo) {
          const buscar = async () => {
            if (!activo) return;
            try {
              const [hallado] = v.readyState >= 2 ? await nativo.detect(v) : [];
              if (hallado?.rawValue) return listo(hallado.rawValue);
            } catch {
              // Un cuadro que no se pudo leer: se intenta con el siguiente.
            }
            espera = setTimeout(buscar, 120);
          };
          buscar();
        } else {
          // Se descarga solo cuando hace falta (iPhone), para no hacer más pesada la app.
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (!activo) return;
          const lector = new BrowserMultiFormatReader(undefined, {
            delayBetweenScanAttempts: 120,
          });
          const controles = await lector.decodeFromStream(flujo, v, (resultado) => {
            if (resultado) listo(resultado.getText());
          });
          detenerZxing = () => controles.stop();
          if (!activo) detenerZxing();
        }
      } catch (e) {
        if (activo) setError(mensajeDeError(e));
      }
    })();

    return () => {
      activo = false;
      clearTimeout(espera);
      detenerZxing?.();
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />

      {!error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-40 w-[min(80vw,26rem)] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
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
          <p className="text-white/85">Lo lee solo. Acerca o aleja el celular hasta que se vea nítido.</p>
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
