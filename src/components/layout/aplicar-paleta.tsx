"use client";

import { useLayoutEffect } from "react";
import type { Paleta } from "@/lib/paletas";

/**
 * Pone los colores de la empresa en <html data-paleta="…"> (así también los toman los
 * diálogos, que se pintan fuera del marco) y los recuerda en este equipo para la próxima carga.
 */
export function AplicarPaleta({ paleta }: { paleta: Paleta }) {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    if (paleta === "indigo") delete raiz.dataset.paleta;
    else raiz.dataset.paleta = paleta;
    try {
      localStorage.setItem("paleta", paleta);
    } catch {}
  }, [paleta]);
  return null;
}
