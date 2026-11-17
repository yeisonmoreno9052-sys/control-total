import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { DIAS_PRUEBA, TIPOS_DEMO } from "@/lib/datos/demo-cliente";
import { obtenerSuperadmin } from "@/lib/sesion";
import { FormularioDemoCliente } from "../componentes";

export default async function DemoCliente() {
  await obtenerSuperadmin();
  return (
    <>
      <EncabezadoPagina
        titulo="Demo para un cliente"
        subtitulo="Con el nombre de su negocio y productos de su tipo, para que desde el inicio la sienta suya."
        volver={{ href: "/emy", texto: "Clientes" }}
      />
      <FormularioDemoCliente tipos={TIPOS_DEMO} dias={DIAS_PRUEBA} />
    </>
  );
}
