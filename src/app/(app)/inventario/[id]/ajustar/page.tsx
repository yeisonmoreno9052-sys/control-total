import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerProducto } from "@/lib/datos/productos";
import { UNIDADES } from "@/lib/inventario/unidades";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioAjuste } from "./formulario";

export const metadata: Metadata = { title: "Ajustar stock · Control Total" };

export default async function AjustarStock({ params }: PageProps<"/inventario/[id]/ajustar">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const { id } = await params;
  const producto = await obtenerProducto(ctx, id);
  if (!producto) return <NoEncontrado />;

  return (
    <div className="max-w-xl">
      <EncabezadoPagina titulo="Ajustar stock" subtitulo={producto.nombre} volver={{ href: `/inventario/${id}`, texto: "Volver al producto" }} />
      <FormularioAjuste
        productoId={producto.id}
        stockActual={producto.stock}
        unidad={UNIDADES[producto.unidad].corto}
        fraccionado={producto.fraccionado}
      />
    </div>
  );
}
