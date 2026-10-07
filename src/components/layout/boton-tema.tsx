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

/** Se ejecuta antes de pintar la página para que no parpadee al cargar en modo oscuro. */
export const SCRIPT_TEMA = `try{if(localStorage.getItem("tema")==="oscuro")document.documentElement.classList.add("dark")}catch(e){}`;
