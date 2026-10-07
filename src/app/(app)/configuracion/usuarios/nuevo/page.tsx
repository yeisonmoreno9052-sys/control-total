import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarNegocios } from "@/lib/datos/negocios";
import { OPCIONES_ROL } from "@/lib/datos/usuarios";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioUsuario } from "../formulario";

export const metadata: Metadata = { title: "Nuevo usuario · Control Total" };

export default async function NuevoUsuario() {
  const ctx = await obtenerContexto();
  if (ctx.rol !== "ADMINISTRADOR") return <SinPermiso />;
  const negocios = await listarNegocios(ctx);
  return (
    <div>
      <EncabezadoPagina titulo="Nuevo usuario" volver={{ href: "/configuracion/usuarios", texto: "Usuarios" }} />
      <FormularioUsuario roles={OPCIONES_ROL} negocios={negocios.map((n) => ({ id: n.id, nombre: n.nombre }))} />
    </div>
  );
}
