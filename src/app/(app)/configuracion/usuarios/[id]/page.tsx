import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarNegocios } from "@/lib/datos/negocios";
import { obtenerUsuario, OPCIONES_ROL } from "@/lib/datos/usuarios";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioUsuario } from "../formulario";
import { Acceso } from "./acceso";

export const metadata: Metadata = { title: "Usuario · Control Total" };

export default async function EditarUsuario({ params }: PageProps<"/configuracion/usuarios/[id]">) {
  const ctx = await obtenerContexto();
  if (ctx.rol !== "ADMINISTRADOR") return <SinPermiso />;
  const { id } = await params;
  const [usuario, negocios] = await Promise.all([obtenerUsuario(ctx, id), listarNegocios(ctx)]);
  if (!usuario) notFound();
  const esUstedMismo = usuario.id === ctx.usuarioId;

  return (
    <div className="space-y-8">
      <EncabezadoPagina titulo={usuario.nombre} volver={{ href: "/configuracion/usuarios", texto: "Usuarios" }} />
      <FormularioUsuario
        key={usuario.id}
        usuario={{
          id: usuario.id,
          nombre: usuario.nombre,
          usuario: usuario.usuario,
          rol: usuario.rol,
          negocios: usuario.rol === "ADMINISTRADOR" ? [] : usuario.negocios.map((n) => n.id),
        }}
        roles={OPCIONES_ROL}
        negocios={negocios.map((n) => ({ id: n.id, nombre: n.nombre }))}
        esUstedMismo={esUstedMismo}
      />
      {!esUstedMismo && (
        <Acceso
          id={usuario.id}
          nombre={usuario.nombre}
          activo={usuario.activo}
          bloqueado={usuario.bloqueado}
          temporal={usuario.debeCambiarContrasena}
        />
      )}
    </div>
  );
}
