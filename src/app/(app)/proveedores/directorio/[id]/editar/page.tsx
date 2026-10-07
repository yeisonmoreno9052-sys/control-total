import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerProveedor } from "@/lib/datos/compras";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioProveedor } from "../../formulario";

export const metadata: Metadata = { title: "Editar proveedor · Control Total" };

export default async function EditarProveedor({ params }: PageProps<"/proveedores/directorio/[id]/editar">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const { id } = await params;
  const proveedor = await obtenerProveedor(ctx, id);
  if (!proveedor) notFound();
  return (
    <div>
      <EncabezadoPagina
        titulo="Editar proveedor"
        volver={{
          href: `/proveedores/directorio/${id}`,
          texto: proveedor.nombre,
        }}
      />
      <FormularioProveedor proveedor={proveedor} />
    </div>
  );
}
