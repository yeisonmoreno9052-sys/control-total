import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioProveedor } from "../formulario";

export const metadata: Metadata = { title: "Nuevo proveedor · Control Total" };

export default async function NuevoProveedor() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  return (
    <div>
      <EncabezadoPagina titulo="Nuevo proveedor" volver={{ href: "/proveedores/directorio", texto: "Proveedores" }} />
      <FormularioProveedor />
    </div>
  );
}
