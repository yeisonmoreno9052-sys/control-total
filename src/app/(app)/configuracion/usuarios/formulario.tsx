"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { guardarUsuarioAccion, type EstadoUsuario } from "./acciones";

type RolOpcion = { valor: string; nombre: string; descripcion: string };

export type UsuarioFormulario = {
  id: string;
  nombre: string;
  usuario: string;
  rol: string;
  negocios: string[];
};

/** Contraseña temporal fácil de dictar: palabra + 4 números. */
export function contrasenaTemporal() {
  const palabras = ["Tornillo", "Martillo", "Llanta", "Piston", "Tuerca", "Cadena", "Bujia", "Taladro"];
  const n = new Uint32Array(2);
  crypto.getRandomValues(n);
  return `${palabras[n[0] % palabras.length]}-${String(1000 + (n[1] % 9000))}`;
}

export function CampoContrasenaTemporal({ error, autoFocus = false }: { error?: string; autoFocus?: boolean }) {
  const [valor, setValor] = useState("");
  return (
    <Campo
      id="contrasena"
      etiqueta="Contraseña temporal"
      error={error}
      ayuda="Mínimo 8 caracteres. Dísela a la persona: al entrar, el sistema le pide crear la suya."
    >
      <div className="flex gap-2">
        <Input
          id="contrasena"
          name="contrasena"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          minLength={8}
          maxLength={100}
          required
          autoComplete="new-password"
          autoFocus={autoFocus}
          className="font-mono"
        />
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setValor(contrasenaTemporal())}>
          Generar
        </Button>
      </div>
    </Campo>
  );
}

export function FormularioUsuario({
  usuario,
  roles,
  negocios,
  esUstedMismo = false,
}: {
  usuario?: UsuarioFormulario;
  roles: RolOpcion[];
  negocios: { id: string; nombre: string }[];
  esUstedMismo?: boolean;
}) {
  const [estado, accion, guardando] = useActionState<EstadoUsuario, FormData>(guardarUsuarioAccion, {});
  const [rol, setRol] = useState(usuario?.rol ?? "CAJERO");
  const e = estado.campos ?? {};

  return (
    <form action={accion} className="max-w-2xl space-y-6">
      {usuario && <input type="hidden" name="id" value={usuario.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo id="nombre" etiqueta="Nombre de la persona" error={e.nombre}>
          <Input
            id="nombre"
            name="nombre"
            defaultValue={usuario?.nombre}
            required
            maxLength={80}
            autoFocus
            placeholder="Ej.: Juan Pérez"
          />
        </Campo>
        {usuario ? (
          <Campo id="usuario" etiqueta="Usuario para entrar" ayuda="No se puede cambiar.">
            <Input id="usuario" value={usuario.usuario} disabled />
          </Campo>
        ) : (
          <Campo id="usuario" etiqueta="Usuario para entrar" error={e.usuario} ayuda="Sin espacios ni tildes. Ej.: juan.ferre">
            <Input
              id="usuario"
              name="usuario"
              required
              minLength={3}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              pattern="[a-zA-Z0-9._\-]+"
            />
          </Campo>
        )}
      </div>

      {!usuario && <CampoContrasenaTemporal error={e.contrasena} />}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Rol</legend>
        {esUstedMismo && <p className="text-sm text-muted-foreground">No puedes cambiar tu propio rol.</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          {roles.map((r) => (
            <label
              key={r.valor}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                rol === r.valor ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                esUstedMismo && rol !== r.valor && "pointer-events-none opacity-50",
              )}
            >
              <input
                type="radio"
                name="rol"
                value={r.valor}
                checked={rol === r.valor}
                onChange={() => setRol(r.valor)}
                disabled={esUstedMismo && rol !== r.valor}
                className="sr-only"
              />
              <span className="flex items-center justify-between font-semibold">
                {r.nombre}
                {rol === r.valor && <Check className="size-5 text-primary" />}
              </span>
              <span className="text-sm text-muted-foreground">{r.descripcion}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {rol === "ADMINISTRADOR" ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">El administrador ve todos los negocios.</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">¿En qué negocios trabaja?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {negocios.map((n) => (
              <label key={n.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 hover:bg-muted/40">
                <input
                  type="checkbox"
                  name="negocios"
                  value={n.id}
                  defaultChecked={usuario ? usuario.negocios.includes(n.id) : negocios.length === 1}
                  className="size-5 accent-primary"
                />
                <span className="font-medium">{n.nombre}</span>
              </label>
            ))}
          </div>
          {e.negocios && <p className="text-sm text-destructive">{e.negocios}</p>}
          <p className="text-sm text-muted-foreground">No verá nada de los negocios que no marques, ni siquiera el nombre.</p>
        </fieldset>
      )}

      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={guardando}>
        {guardando ? "Guardando…" : usuario ? "Guardar cambios" : "Crear usuario"}
      </Button>
    </form>
  );
}
