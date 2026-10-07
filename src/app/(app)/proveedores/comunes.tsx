import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/proveedores", titulo: "Facturas" },
  { href: "/proveedores/por-pagar", titulo: "Por pagar" },
  { href: "/proveedores/directorio", titulo: "Proveedores" },
] as const;

/** Las tres vistas del módulo, siempre arriba. */
export function Pestanas({ activa }: { activa: (typeof PESTANAS)[number]["href"] }) {
  return (
    <nav aria-label="Secciones de proveedores" className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {PESTANAS.map((p) => (
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

export function EstadoFactura({ estado, estadoPago }: { estado: string; estadoPago: string }) {
  if (estado === "ANULADA") return <Badge variant="destructive">Anulada</Badge>;
  if (estadoPago === "PAGADA") return <Badge variant="secondary">Pagada</Badge>;
  if (estadoPago === "ABONO_PARCIAL") return <Badge variant="aviso">Con abonos</Badge>;
  return <Badge variant="aviso">Pendiente</Badge>;
}
