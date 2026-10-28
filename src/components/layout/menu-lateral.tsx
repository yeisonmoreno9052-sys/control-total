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
          "group flex h-12 items-center gap-3 rounded-xl px-2.5 text-[15px] font-medium transition-colors max-lg:justify-center",
          activa
            ? "bg-gradient-to-r from-menu-resalte/30 to-menu-resalte/5 text-menu-activo-foreground"
            : "text-menu-foreground hover:bg-white/5 hover:text-white",
          !disponible && "pointer-events-none opacity-60",
        );
        if (!disponible) {
          return (
            <span key={href} className={clases} aria-disabled="true">
              <Chip activa={false}>
                <Icono className="size-[18px]" />
              </Chip>
              <span className="max-lg:sr-only">{titulo}</span>
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal max-lg:hidden">Pronto</span>
            </span>
          );
        }
        return (
          <Link key={href} href={href} className={clases} aria-current={activa ? "page" : undefined} title={titulo}>
            <Chip activa={activa}>
              <Icono className="size-[18px]" />
            </Chip>
            <span className="max-lg:sr-only">{titulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Cuadrito detrás del ícono: de color en la opción en la que se está. */
function Chip({ activa, children }: { activa: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-colors",
        activa
          ? "bg-gradient-to-br from-chip-desde to-chip-hasta text-white shadow-lg shadow-chip-sombra"
          : "bg-white/5 group-hover:bg-white/10",
      )}
    >
      {children}
    </span>
  );
}
