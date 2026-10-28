"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Cambia entre modo claro (por defecto) y oscuro. Se recuerda en este equipo. */
export function BotonTema() {
  function alternar() {
    const oscuro = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("tema", oscuro ? "oscuro" : "claro");
    } catch {}
  }

  return (
    <Button variant="ghost" size="icon" onClick={alternar} aria-label="Cambiar modo claro u oscuro">
      <Sun className="size-5 dark:hidden" />
      <Moon className="hidden size-5 dark:block" />
    </Button>
  );
}

/**
 * Se ejecuta antes de pintar la página para que no parpadee al cargar en modo oscuro
 * ni con los colores de otra empresa (la paleta la recuerda AplicarPaleta).
 */
export const SCRIPT_TEMA = `try{var d=document.documentElement;if(localStorage.getItem("tema")==="oscuro")d.classList.add("dark");var p=localStorage.getItem("paleta");if(p&&p!=="indigo")d.dataset.paleta=p}catch(e){}`;
