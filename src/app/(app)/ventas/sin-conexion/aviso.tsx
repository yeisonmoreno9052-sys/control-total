"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConexion } from "@/components/sin-conexion/conexion";

/** Con internet de vuelta, la caja normal (que revisa que la caja del día esté abierta). */
export function AvisoCajaSinConexion() {
  const { enLinea, usuario } = useConexion();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <p>Caja · {usuario.nombre}</p>
      {enLinea && (
        <Button asChild size="sm">
          <Link href="/ventas">Volvió el internet: ir a la caja normal</Link>
        </Button>
      )}
    </div>
  );
}
