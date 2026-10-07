import Link from "next/link";
import type { Rol } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/configuracion", titulo: "Negocio", soloAdmin: false },
  { href: "/configuracion/usuarios", titulo: "Usuarios", soloAdmin: true },
  { href: "/configuracion/historial", titulo: "Historial de cambios", soloAdmin: false },
] as const;

export function PestanasConfiguracion({ activa, rol }: { activa: (typeof PESTANAS)[number]["href"]; rol: Rol }) {
  const visibles = PESTANAS.filter((p) => !p.soloAdmin || rol === "ADMINISTRADOR");
  return (
    <nav aria-label="Secciones de configuración" className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {visibles.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.href === activa ? "page" : undefined}
          className={cn(
            "flex h-10 flex-1 items-center justify-center rounded-lg px-3 text-sm font-medium whitespace-nowrap",
            p.href === activa ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.titulo}
        </Link>
      ))}
    </nav>
  );
}
