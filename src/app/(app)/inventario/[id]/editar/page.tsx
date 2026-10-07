import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCategorias, obtenerMargenNegocio } from "@/lib/datos/categorias";
import { obtenerProducto } from "@/lib/datos/productos";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioProducto } from "../../formulario-producto";

export const metadata: Metadata = { title: "Editar producto · Control Total" };

export default async function EditarProducto({ params }: PageProps<"/inventario/[id]/editar">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const { id } = await params;
  const producto = await obtenerProducto(ctx, id);
  if (!producto) return <NoEncontrado />;
  const [categorias, margen] = await Promise.all([
    listarCategorias(ctx, producto.negocioId),
    obtenerMargenNegocio(ctx, producto.negocioId),
  ]);

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina titulo="Editar producto" subtitulo={producto.nombre} volver={{ href: `/inventario/${id}`, texto: "Volver al producto" }} />
      <FormularioProducto
        categorias={categorias}
        margenNegocio={margen}
        valores={{
          id: producto.id,
          codigo: producto.codigo,
          codigoBarras: producto.codigoBarras ?? "",
          nombre: producto.nombre,
          descripcion: producto.descripcion ?? "",
          categoriaId: producto.categoriaId ?? "",
          costo: producto.costo ?? 0,
          precioVenta: producto.precioVenta,
          stockMinimo: producto.stockMinimo,
          unidad: producto.unidad,
          fraccionado: producto.fraccionado,
          porcentajeIva: producto.porcentajeIva,
          condicion: producto.condicion,
        }}
      />
    </div>
  );
}
