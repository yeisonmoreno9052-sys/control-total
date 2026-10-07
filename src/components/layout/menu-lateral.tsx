"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Modulo, Rol } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { opcionesPara } from "./menu";

export function MenuLateral({ rol, modulos }: { rol: Rol; modulos: Modulo[] }) {
  const ruta = usePathname();
  const opciones = opcionesPara(rol, modulos);

  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-1 p-3">
      {opciones.map(({ titulo, href, icono: Icono, disponible }) => {
        const activa = ruta === href || ruta.startsWith(`${href}/`);
        const clases = cn(
          "flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-medium transition-colors",
          activa ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          !disponible && "pointer-events-none opacity-60",
        );
        if (!disponible) {
          return (
            <span key={href} className={clases} aria-disabled="true">
              <Icono className="size-5" />
              {titulo}
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-normal">Pronto</span>
            </span>
          );
        }
        return (
          <Link key={href} href={href} className={clases} aria-current={activa ? "page" : undefined}>
            <Icono className="size-5" />
            {titulo}
          </Link>
        );
      })}
    </nav>
  );
}
