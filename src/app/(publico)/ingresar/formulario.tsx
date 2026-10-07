"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ingresar } from "./acciones";

export function FormularioIngreso() {
  const [estado, accion, enviando] = useActionState(ingresar, {});

  return (
    <Card>
      <CardContent>
        <form action={accion} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="usuario">Usuario</Label>
            <Input
              id="usuario"
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus={!estado.usuario}
              defaultValue={estado.usuario}
              aria-invalid={!!estado.error}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrasena">Contraseña</Label>
            <Input
              id="contrasena"
              name="contrasena"
              type="password"
              autoComplete="current-password"
              required
              autoFocus={!!estado.usuario}
              aria-invalid={!!estado.error}
            />
          </div>
          {estado.error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {estado.error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={enviando}>
            {enviando ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
