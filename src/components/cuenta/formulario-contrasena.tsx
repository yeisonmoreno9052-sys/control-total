"use client";

import { useActionState, useState } from "react";
import { CircleCheck, Eye, EyeOff } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EstadoContrasena = { error?: string; campos?: Record<string, string>; ok?: boolean };

/** Cambiar la contraseña (pide la actual) o crearla al entrar con una temporal (no la pide). */
export function FormularioContrasena({
  accion,
  pedirActual,
  textoBoton,
}: {
  accion: (estado: EstadoContrasena, f: FormData) => Promise<EstadoContrasena>;
  pedirActual: boolean;
  textoBoton: string;
}) {
  const [estado, enviar, guardando] = useActionState<EstadoContrasena, FormData>(accion, {});
  const [ver, setVer] = useState(false);
  const e = estado.campos ?? {};
  const tipo = ver ? "text" : "password";

  if (estado.ok) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
        <CircleCheck className="size-5 shrink-0" /> Listo, tu contraseña quedó cambiada.
      </p>
    );
  }

  return (
    <form action={enviar} className="space-y-5">
      {pedirActual && (
        <Campo id="actual" etiqueta="Contraseña actual" error={e.actual}>
          <Input id="actual" name="actual" type={tipo} required autoComplete="current-password" maxLength={200} />
        </Campo>
      )}
      <Campo
        id="nueva"
        etiqueta="Contraseña nueva"
        error={e.nueva}
        ayuda="Mínimo 8 caracteres. Que sea fácil de recordar para ti y difícil de adivinar para otros."
      >
        <Input
          id="nueva"
          name="nueva"
          type={tipo}
          required
          minLength={8}
          maxLength={100}
          autoComplete="new-password"
          autoFocus={!pedirActual}
        />
      </Campo>
      <Campo id="repetir" etiqueta="Repite la contraseña nueva" error={e.repetir}>
        <Input id="repetir" name="repetir" type={tipo} required minLength={8} maxLength={100} autoComplete="new-password" />
      </Campo>
      <button type="button" className="flex items-center gap-2 text-sm text-muted-foreground" onClick={() => setVer((v) => !v)}>
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {ver ? "Ocultar contraseñas" : "Ver lo que escribo"}
      </button>
      <AvisoError mensaje={Object.keys(e).length ? undefined : estado.error} />
      <Button type="submit" size="lg" className="h-12 w-full" disabled={guardando}>
        {guardando ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
