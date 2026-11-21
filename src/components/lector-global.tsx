"use client";

import { useEffect, type RefObject } from "react";

/** ¿Está el cursor en un lugar donde se escribe? Ahí el lector escribe normal. */
function escribiendoEnOtroLado() {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * El lector de código de barras escribe como un teclado. Si nadie tiene el cursor
 * (se abrió la pantalla, se tocó un botón, se cerró una ventana), lo que escriba
 * va directo al buscador: no hay que hacer clic en él antes de escanear.
 * También sirve para empezar a escribir un nombre sin tocar el buscador.
 */
export function useLectorGlobal(entrada: RefObject<HTMLInputElement | null> | (() => HTMLInputElement | null)) {
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      if (escribiendoEnOtroLado()) return;
      // Con una ventana abierta (cobrar, cantidad…) las teclas son de esa ventana.
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      const el = typeof entrada === "function" ? entrada() : entrada.current;
      if (!el || el.disabled || el.readOnly || !el.isConnected || el.offsetParent === null) return;

      e.preventDefault();
      el.focus();
      // Se agrega la letra como si se hubiera escrito ahí (así React y los formularios se enteran).
      const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      const nuevo = el.value + e.key;
      if (poner) poner.call(el, nuevo);
      else el.value = nuevo;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      // Las siguientes letras ya caen en el buscador por sí solas.
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [entrada]);
}

/** Para pantallas del servidor: el buscador se identifica por su id. */
export function LectorGlobal({ idEntrada }: { idEntrada: string }) {
  useLectorGlobal(() => document.getElementById(idEntrada) as HTMLInputElement | null);
  return null;
}
