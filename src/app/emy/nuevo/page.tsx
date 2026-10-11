import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { obtenerSuperadmin } from "@/lib/sesion";
import { FormularioNuevoCliente } from "../componentes";

export default async function NuevoCliente() {
  await obtenerSuperadmin();
  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo cliente"
        subtitulo="Crea la empresa, sus locales y el usuario de quien la administra."
        volver={{ href: "/emy", texto: "Clientes" }}
      />
      <FormularioNuevoCliente />
    </>
  );
}
