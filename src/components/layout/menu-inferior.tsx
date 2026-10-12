"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import type { Modulo, Rol } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { opcionesPara, type OpcionMenu } from "./menu";

export function MenuInferior({ rol, modulos }: { rol: Rol; modulos: Modulo[] }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const todas = opcionesPara(rol, modulos).filter((o) => o.disponible);
  const enBarra = todas.filter((o) => o.enCelular);
  // Caben 5 botones: si hay más opciones, las que sobran van en "Más".
  const sobran = enBarra.length > 5 || todas.length > enBarra.length;
  const visibles = sobran ? enBarra.slice(0, 4) : enBarra;
  const resto = sobran ? todas.filter((o) => !visibles.includes(o)) : [];
  const esActiva = (href: string) => ruta === href || ruta.startsWith(`${href}/`);
  const restoActivo = resto.some((o) => esActiva(o.href));
  const clases = (activa: boolean) =>
    cn(
      "flex h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-xs font-medium",
      activa ? "text-white" : "text-menu-foreground",
    );

  return (
    <nav
      aria-label="Menú principal"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[22px] bg-menu text-menu-foreground shadow-[0_16px_34px_-10px_rgb(15_19_48/0.6)] md:hidden"
    >
      {abierto && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú"
            className="fixed inset-0 -z-10 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <ul className="absolute right-0 bottom-full mb-2 w-56 overflow-hidden rounded-2xl border bg-card text-foreground shadow-lg">
            {resto.map((o) => (
              <li key={o.href}>
                <OpcionLista opcion={o} activa={esActiva(o.href)} alElegir={() => setAbierto(false)} />
              </li>
            ))}
          </ul>
        </>
      )}
      <ul className="flex">
        {visibles.map(({ titulo, href, icono: Icono }) => (
          <li key={href} className="min-w-0 flex-1">
            <Link href={href} className={clases(esActiva(href))} aria-current={esActiva(href) ? "page" : undefined}>
              <Pastilla activa={esActiva(href)}>
                <Icono className="size-5" />
              </Pastilla>
              <span className="max-w-full truncate">{titulo}</span>
            </Link>
          </li>
        ))}
        {resto.length > 0 && (
          <li className="min-w-0 flex-1">
            <button
              type="button"
              className={clases(restoActivo || abierto)}
              aria-expanded={abierto}
              onClick={() => setAbierto((a) => !a)}
            >
              <Pastilla activa={restoActivo || abierto}>
                <Ellipsis className="size-5" />
              </Pastilla>
              <span>Más</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

function OpcionLista({ opcion, activa, alElegir }: { opcion: OpcionMenu; activa: boolean; alElegir: () => void }) {
  const { titulo, href, icono: Icono } = opcion;
  return (
    <Link
      href={href}
      onClick={alElegir}
      aria-current={activa ? "page" : undefined}
      className={cn("flex h-14 items-center gap-3 px-4 text-base hover:bg-muted", activa && "font-semibold text-primary")}
    >
      <Icono className="size-5" />
      {titulo}
    </Link>
  );
}

/** Fondo de color detrás del ícono de la opción en la que se está. */
function Pastilla({ activa, children }: { activa: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
        activa && "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/40",
      )}
    >
      {children}
    </span>
  );
}
