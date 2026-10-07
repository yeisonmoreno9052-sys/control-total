"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Modulo, Rol } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { opcionesPara } from "./menu";

export function MenuInferior({ rol, modulos }: { rol: Rol; modulos: Modulo[] }) {
  const ruta = usePathname();
  const opciones = opcionesPara(rol, modulos).filter((o) => o.enCelular).slice(0, 5);

  return (
    <nav
      aria-label="Menú principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex">
        {opciones.map(({ titulo, href, icono: Icono, disponible }) => {
          const activa = ruta === href || ruta.startsWith(`${href}/`);
          const contenido = (
            <>
              <Icono className="size-5" />
              <span>{titulo}</span>
            </>
          );
          const clases = cn(
            "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
            activa ? "text-primary" : "text-muted-foreground",
            !disponible && "opacity-50",
          );
          return (
            <li key={href} className="flex-1">
              {disponible ? (
                <Link href={href} className={clases} aria-current={activa ? "page" : undefined}>
                  {contenido}
                </Link>
              ) : (
                <span className={clases} aria-disabled="true" title="Disponible pronto">
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
