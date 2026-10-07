"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { desactivarProducto } from "../acciones";

export function BotonActivo({ id, activo }: { id: string; activo: boolean }) {
  const [cambiando, iniciar] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      className={activo ? "text-destructive hover:text-destructive" : ""}
      disabled={cambiando}
      onClick={() =>
        iniciar(async () => {
          if (activo && !confirm("¿Desactivar este producto? Dejará de aparecer en el inventario y en la caja.")) return;
          await desactivarProducto(id, !activo);
          router.refresh();
        })
      }
    >
      {activo ? "Desactivar producto" : "Volver a activar"}
    </Button>
  );
}
