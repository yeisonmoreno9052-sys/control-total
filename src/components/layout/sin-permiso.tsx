import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "./estado-vacio";

export function SinPermiso() {
  return (
    <EstadoVacio
      icono={Lock}
      titulo="No tienes permiso para ver esto"
      descripcion="Si crees que deberías tener acceso, pídeselo al administrador."
      accion={
        <Button asChild variant="outline">
          <Link href="/panel">Ir al inicio</Link>
        </Button>
      }
    />
  );
}
