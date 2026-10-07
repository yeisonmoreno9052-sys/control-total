"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cambiarActivoProveedorAccion } from "../../acciones";

export function BotonActivoProveedor({ id, activo }: { id: string; activo: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pendiente}
      onClick={() => iniciar(async () => void (await cambiarActivoProveedorAccion(id, !activo)))}
    >
      {activo ? "Desactivar" : "Activar"}
    </Button>
  );
}
