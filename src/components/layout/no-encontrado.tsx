import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "./estado-vacio";

/** Lo que se ve cuando algo no existe o es de un negocio al que el usuario no tiene acceso. */
export function NoEncontrado() {
  return (
    <EstadoVacio
      icono={SearchX}
      titulo="No encontramos lo que buscas"
      descripcion="Puede que no exista o que no tengas acceso a este negocio."
      accion={
        <Button asChild variant="outline">
          <Link href="/panel">Ir al inicio</Link>
        </Button>
      }
    />
  );
}
