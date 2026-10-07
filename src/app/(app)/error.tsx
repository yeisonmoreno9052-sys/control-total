"use client";

import { Button } from "@/components/ui/button";

/** Si algo falla en el servidor, un mensaje claro en lugar de una pantalla técnica. */
export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const sinPermiso = error.message?.startsWith("Acceso denegado");
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{sinPermiso ? "No tienes permiso para hacer esto" : "Algo salió mal"}</h1>
      <p className="text-muted-foreground">
        {sinPermiso
          ? "Si crees que deberías tener acceso, pídeselo al administrador."
          : "Intenta de nuevo. Si vuelve a pasar, avísale a soporte de EMY TELECOM."}
      </p>
      <Button onClick={reset}>Intentar de nuevo</Button>
    </div>
  );
}
