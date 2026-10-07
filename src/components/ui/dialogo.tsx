"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ventana modal con el <dialog> del navegador: atrapa el foco, se cierra con Esc
 * o tocando afuera. El contenido solo existe mientras está abierta, así cada vez
 * arranca limpio.
 */
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  extra,
  children,
  className,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) {
      d.showModal();
      // El autoFocus de React corre antes de que la ventana esté abierta, así que se
      // enfoca aquí: lo marcado con data-autofocus, o el primer campo.
      d.querySelector<HTMLElement>(
        "[data-autofocus], input:not([type=hidden]):not([disabled]), textarea, select",
      )?.focus();
    }
    if (!abierto && d.open) {
      d.close();
      // Chrome le devuelve el foco al campo que lo tenía antes de abrir, pero a veces ese
      // campo no recibe lo que se escribe hasta que se vuelve a enfocar: se suelta y se toma.
      const previo = document.activeElement;
      if (previo instanceof HTMLInputElement || previo instanceof HTMLTextAreaElement) {
        previo.blur();
        previo.focus();
      }
    }
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40",
        className,
      )}
    >
      {abierto && (
        <div className="p-5 md:p-6">
          {titulo && (
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{titulo}</h2>
              <div className="flex items-center gap-2">
                {extra}
                <button
                  type="button"
                  onClick={onCerrar}
                  aria-label="Cerrar"
                  className="-mr-2 rounded-md p-2 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Tecla de atajo pequeña al lado de un botón ("F4"). Se oculta en celular. */
export function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="hidden rounded border border-current/25 px-1.5 py-0.5 font-sans text-[11px] font-medium opacity-70 md:inline">
      {children}
    </kbd>
  );
}
