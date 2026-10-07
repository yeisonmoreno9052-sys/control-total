import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Plus } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listarUsuarios, ROLES, type RolEmpresa } from "@/lib/datos/usuarios";
import { obtenerContexto } from "@/lib/sesion";
import { PestanasConfiguracion } from "../pestanas";

export const metadata: Metadata = { title: "Usuarios · Control Total" };

export default async function Usuarios({ searchParams }: PageProps<"/configuracion/usuarios">) {
  const ctx = await obtenerContexto();
  if (ctx.rol !== "ADMINISTRADOR") return <SinPermiso />;
  const sp = await searchParams;
  const usuarios = await listarUsuarios(ctx);
  const aviso =
    typeof sp.creado === "string"
      ? usuarios.find((u) => u.id === sp.creado)
      : typeof sp.guardado === "string"
        ? usuarios.find((u) => u.id === sp.guardado)
        : null;

  return (
    <div>
      <EncabezadoPagina
        titulo="Configuración"
        acciones={
          <Button asChild size="lg">
            <Link href="/configuracion/usuarios/nuevo">
              <Plus /> Nuevo usuario
            </Link>
          </Button>
        }
      />
      <PestanasConfiguracion activa="/configuracion/usuarios" rol={ctx.rol} />

      {aviso && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <CircleCheck className="size-5 shrink-0" />
          {typeof sp.creado === "string"
            ? `Listo. ${aviso.nombre} ya puede entrar con el usuario "${aviso.usuario}" y la contraseña temporal.`
            : `Se guardaron los cambios de ${aviso.nombre}.`}
        </p>
      )}

      <ul className="divide-y rounded-xl border">
        {usuarios.map((u) => (
          <li key={u.id}>
            <Link
              href={`/configuracion/usuarios/${u.id}`}
              className="flex items-center gap-4 p-4 hover:bg-muted/40 active:bg-muted"
            >
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold ${
                  u.activo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
                aria-hidden
              >
                {u.nombre.trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className={u.activo ? "" : "text-muted-foreground line-through"}>{u.nombre}</span>
                  {u.id === ctx.usuarioId && <Badge variant="secondary">Tú</Badge>}
                  {!u.activo && <Badge variant="secondary">Inactivo</Badge>}
                  {u.activo && u.bloqueado && <Badge variant="destructive">Bloqueado</Badge>}
                  {u.activo && u.debeCambiarContrasena && <Badge variant="aviso">Contraseña temporal</Badge>}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {u.usuario} · {ROLES[u.rol as RolEmpresa]?.nombre ?? u.rol} ·{" "}
                  {u.rol === "ADMINISTRADOR" ? "Todos los negocios" : u.negocios.map((n) => n.nombre).join(", ") || "Sin negocio"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
