"use client";

// Teclado numérico en pantalla para la caja con pantalla táctil.
//
// - Se activa solo en equipos táctiles grandes (computador táctil o tableta); en el
//   celular se usa el teclado del teléfono. Cada equipo puede forzarlo en Mi cuenta.
// - Las teclas escriben en el campo numérico que tiene el foco (los marcados con
//   data-teclado). Tocar una tecla no le quita el foco al campo.
// - Mientras está activo, los campos piden inputMode="none" para que el sistema no
//   abra su propio teclado encima.
import { useSyncExternalStore } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreferenciaTeclado = "auto" | "si" | "no";

const CLAVE = "control-total:teclado-en-pantalla";
const CONSULTA_TACTIL = "(any-pointer: coarse) and (min-width: 768px)";
const oyentes = new Set<() => void>();

function leerPreferencia(): PreferenciaTeclado {
  try {
    const v = window.localStorage.getItem(CLAVE);
    return v === "si" || v === "no" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function guardarPreferenciaTeclado(p: PreferenciaTeclado) {
  try {
    if (p === "auto") window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, p);
  } catch {
    // Sin almacenamiento (ventana privada): la elección dura hasta recargar.
  }
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  const consulta = window.matchMedia(CONSULTA_TACTIL);
  consulta.addEventListener("change", o);
  window.addEventListener("storage", o);
  return () => {
    oyentes.delete(o);
    consulta.removeEventListener("change", o);
    window.removeEventListener("storage", o);
  };
}

function activoAhora() {
  const p = leerPreferencia();
  return p === "auto" ? window.matchMedia(CONSULTA_TACTIL).matches : p === "si";
}

/** Si el teclado en pantalla está activo en este equipo. En el servidor, no. */
export function useTecladoActivo() {
  return useSyncExternalStore(suscribir, activoAhora, () => false);
}

export function usePreferenciaTeclado() {
  return useSyncExternalStore(suscribir, leerPreferencia, () => "auto" as const);
}

/** Props para un campo que recibe el teclado en pantalla. */
export function useCampoTeclado(modo: "numeric" | "decimal" = "numeric") {
  const activo = useTecladoActivo();
  return { "data-teclado": "", inputMode: activo ? ("none" as const) : modo };
}

// ─── Escribir en el campo ───────────────────────────────────────────────────

export type Tecla = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "," | "borrar" | "limpiar";

/** El texto del campo después de tocar una tecla (se escribe siempre al final). */
export function aplicarTecla(texto: string, tecla: Tecla) {
  if (tecla === "limpiar") return "";
  if (tecla === "borrar") return texto.slice(0, -1);
  if (tecla === ",") return texto.includes(",") ? texto : `${texto || "0"},`;
  return texto + tecla;
}

let ultimoCampo: HTMLInputElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.hasAttribute("data-teclado")) ultimoCampo = e.target;
  });
}

function campoObjetivo() {
  const activo = document.activeElement;
  if (activo instanceof HTMLInputElement && activo.hasAttribute("data-teclado")) return activo;
  return ultimoCampo?.isConnected && !ultimoCampo.disabled ? ultimoCampo : null;
}

function escribir(tecla: Tecla) {
  const campo = campoObjetivo();
  if (!campo) return;
  // Se cambia el valor como lo haría el teclado, para que React se entere (onChange).
  const asignar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  asignar?.call(campo, aplicarTecla(campo.value, tecla));
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  campo.focus();
}

const FILAS: Tecla[][] = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
];

/**
 * Teclado de números. `decimales` pone la coma (cantidades en metros o kilos, porcentajes);
 * si no, la tecla "00" para escribir pesos rápido.
 */
export function TecladoNumerico({ decimales = false, className }: { decimales?: boolean; className?: string }) {
  const activo = useTecladoActivo();
  if (!activo) return null;
  const ultima: Tecla[] = [decimales ? "," : "00", "0", "borrar"];
  return (
    <div className={cn("space-y-2", className)} role="group" aria-label="Teclado numérico">
      <div className="grid grid-cols-3 gap-2">
        {[...FILAS, ultima].flat().map((t) => (
          <button
            key={t}
            type="button"
            // Que tocar la tecla no le quite el foco al campo.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => escribir(t)}
            aria-label={t === "borrar" ? "Borrar" : t === "," ? "Coma" : t}
            className="flex h-14 items-center justify-center rounded-xl border bg-card text-2xl font-semibold tabular-nums select-none active:bg-muted"
          >
            {t === "borrar" ? <Delete className="size-6" /> : t}
          </button>
        ))}
      </div>
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => escribir("limpiar")}
        className="h-10 w-full rounded-lg text-sm text-muted-foreground active:bg-muted"
      >
        Borrar todo
      </button>
    </div>
  );
}
