"use client";

// Instalar Control Total como aplicación en este equipo.
//
// - En Chrome y Edge (PC y Android) el navegador avisa con "beforeinstallprompt" que se
//   puede instalar; ese aviso llega una sola vez al cargar la página, así que se guarda
//   aquí apenas llega (CapturaInstalacion va en el diseño raíz) y el botón lo usa después.
// - En iPhone no hay botón posible: se explica cómo hacerlo con "Compartir".
import { useSyncExternalStore } from "react";
import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type AvisoInstalacion = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let aviso: AvisoInstalacion | null = null;
let instalada = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // Que no salga el aviso del navegador solo; se instala desde el botón.
    aviso = e as AvisoInstalacion;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    aviso = null;
    instalada = true;
    avisar();
  });
}

/** Va una vez en el diseño raíz para que el aviso del navegador no se pierda. */
export function CapturaInstalacion() {
  return null;
}

type Estado = "instalada" | "disponible" | "iphone" | "otro";

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

function estadoActual(): Estado {
  const comoApp =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (instalada || comoApp) return "instalada";
  if (aviso) return "disponible";
  // iPad moderno se presenta como Mac, pero con pantalla táctil.
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? "iphone" : "otro";
}

export function InstalarApp() {
  const estado = useSyncExternalStore(suscribir, estadoActual, () => "otro" as const);

  if (estado === "instalada") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-5 text-emerald-600" /> Control Total ya está instalado en este equipo.
      </p>
    );
  }

  if (estado === "disponible") {
    return (
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={async () => {
          const actual = aviso;
          if (!actual) return;
          await actual.prompt();
          const { outcome } = await actual.userChoice;
          // El aviso sirve una sola vez; si dijo que no, el navegador manda otro más adelante.
          aviso = null;
          if (outcome === "accepted") instalada = true;
          avisar();
        }}
      >
        <Download /> Instalar en este equipo
      </Button>
    );
  }

  if (estado === "iphone") {
    return (
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <Paso n={1} />
          <span>
            Abre esta página en <strong>Safari</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <Paso n={2} />
          <span>
            Toca <Share className="inline size-4 align-text-bottom" /> <strong>Compartir</strong>. Si no lo ves, toca primero{" "}
            <strong>···</strong> al lado de la dirección.
          </span>
        </li>
        <li className="flex gap-3">
          <Paso n={3} />
          <span>
            Elige <SquarePlus className="inline size-4 align-text-bottom" /> <strong>Agregar a pantalla de inicio</strong> y luego{" "}
            <strong>Agregar</strong>.
          </span>
        </li>
      </ol>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Abre Control Total en <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong>. Si ya estás en uno de ellos, busca
      el ícono de instalar <Download className="inline size-4 align-text-bottom" /> al lado derecho de la barra de direcciones.
    </p>
  );
}

function Paso({ n }: { n: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {n}
    </span>
  );
}
