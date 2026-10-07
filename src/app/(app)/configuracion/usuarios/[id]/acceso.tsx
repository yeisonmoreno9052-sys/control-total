"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, UserCheck, UserX } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { cambiarEstadoUsuarioAccion, restablecerContrasenaAccion, type EstadoUsuario } from "../acciones";
import { CampoContrasenaTemporal } from "../formulario";

export function Acceso({
  id,
  nombre,
  activo,
  bloqueado,
  temporal,
}: {
  id: string;
  nombre: string;
  activo: boolean;
  bloqueado: boolean;
  temporal: boolean;
}) {
  const primerNombre = nombre.split(" ")[0];
  const [dialogo, setDialogo] = useState<"contrasena" | "estado" | null>(null);
  const [estado, accion, guardando] = useActionState<EstadoUsuario, FormData>(restablecerContrasenaAccion, {});
  const [errorEstado, setErrorEstado] = useState<string>();
  const [cambiando, iniciar] = useTransition();
  // Cada respuesta del servidor es un objeto nuevo: al llegar una exitosa, se cierra el diálogo.
  const [visto, setVisto] = useState(estado);
  const [listo, setListo] = useState(false);
  if (estado !== visto) {
    setVisto(estado);
    if (estado.ok) {
      setListo(true);
      setDialogo(null);
    }
  }

  return (
    <section className="max-w-2xl space-y-4 rounded-2xl border p-5 md:p-6">
      <div>
        <h2 className="text-lg font-semibold">Acceso</h2>
        <p className="text-sm text-muted-foreground">
          {!activo
            ? `${primerNombre} está desactivado: no puede entrar. Sus ventas y registros se conservan.`
            : bloqueado
              ? `${primerNombre} está bloqueado por equivocarse varias veces en la contraseña. Ponle una temporal para desbloquearlo.`
              : temporal || listo
                ? `${primerNombre} tiene una contraseña temporal: al entrar debe crear la suya.`
                : `${primerNombre} puede entrar normalmente.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {activo && (
          <Button variant="outline" size="lg" onClick={() => setDialogo("contrasena")}>
            <KeyRound /> Poner contraseña temporal
          </Button>
        )}
        <Button
          variant={activo ? "outline" : "default"}
          size="lg"
          className={activo ? "text-destructive hover:text-destructive" : ""}
          onClick={() => {
            setErrorEstado(undefined);
            setDialogo("estado");
          }}
        >
          {activo ? <UserX /> : <UserCheck />} {activo ? "Desactivar" : "Volver a activar"}
        </Button>
      </div>

      <Dialogo
        abierto={dialogo === "contrasena"}
        onCerrar={() => setDialogo(null)}
        titulo={`Contraseña temporal para ${primerNombre}`}
      >
        <form action={accion} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-muted-foreground">
            Si {primerNombre} tiene el sistema abierto en otro equipo, se le cerrará. También se desbloquea si estaba bloqueado.
          </p>
          <CampoContrasenaTemporal error={estado.campos?.contrasena} autoFocus />
          <AvisoError mensaje={estado.campos?.contrasena ? undefined : estado.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </div>
        </form>
      </Dialogo>

      <Dialogo
        abierto={dialogo === "estado"}
        onCerrar={() => setDialogo(null)}
        titulo={activo ? `¿Desactivar a ${primerNombre}?` : `¿Volver a activar a ${primerNombre}?`}
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            {activo
              ? `${primerNombre} no podrá entrar, y si está adentro se le cerrará la sesión. Sus ventas y registros se conservan. Lo puedes volver a activar cuando quieras.`
              : `${primerNombre} podrá volver a entrar con su contraseña de siempre.`}
          </p>
          <AvisoError mensaje={errorEstado} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="lg" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button
              size="lg"
              variant={activo ? "destructive" : "default"}
              disabled={cambiando}
              onClick={() =>
                iniciar(async () => {
                  const r = await cambiarEstadoUsuarioAccion(id, !activo);
                  if (r.error) setErrorEstado(r.error);
                  else setDialogo(null);
                })
              }
            >
              {activo ? "Sí, desactivar" : "Sí, activar"}
            </Button>
          </div>
        </div>
      </Dialogo>
    </section>
  );
}
