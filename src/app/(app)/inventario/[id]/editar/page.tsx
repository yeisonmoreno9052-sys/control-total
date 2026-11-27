import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { slugCatalogo } from "@/lib/datos/catalogo";
import { listarCategorias, obtenerMargenNegocio } from "@/lib/datos/categorias";
import { MAX_FOTOS_EXTRA, obtenerGaleria } from "@/lib/datos/fotos-catalogo";
import { obtenerPreferenciasVenta } from "@/lib/datos/negocios";
import { obtenerProducto } from "@/lib/datos/productos";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos, puedeGestionar, puedeVerCostos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioProducto } from "../../formulario-producto";
import { FotoProducto } from "./foto-producto";
import { FotosCatalogo } from "./fotos-catalogo";

export const metadata: Metadata = { title: "Editar producto · Control Total" };

export default async function EditarProducto({ params }: PageProps<"/inventario/[id]/editar">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeEditarProductos(ctx)) return <SinPermiso />;
  const { id } = await params;
  const producto = await obtenerProducto(ctx, id);
  if (!producto) return <NoEncontrado />;
  const [categorias, margen, preferencias, catalogo] = await Promise.all([
    listarCategorias(ctx, producto.negocioId),
    obtenerMargenNegocio(ctx, producto.negocioId),
    obtenerPreferenciasVenta(ctx, producto.negocioId),
    slugCatalogo(ctx, producto.negocioId),
  ]);
  // Las fotos extra solo sirven si la tienda tiene el catálogo en línea prendido.
  const galeria = catalogo ? await obtenerGaleria(ctx, producto.id) : null;

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina titulo="Editar producto" subtitulo={producto.nombre} volver={{ href: `/inventario/${id}`, texto: "Volver al producto" }} />
      <FotoProducto
        productoId={producto.id}
        fotoUrl={producto.fotoUrl}
        talla={producto.prendaId ? { color: producto.color } : null}
      />
      {galeria && <FotosCatalogo productoId={producto.id} galeria={galeria} maximo={MAX_FOTOS_EXTRA} />}
      <FormularioProducto
        categorias={categorias}
        margenNegocio={margen}
        ivaPorDefecto={preferencias.ivaPorDefecto}
        usaBotonesRapidos={preferencias.botonesRapidos}
        verCostos={puedeVerCostos(ctx)}
        crearCategorias={puedeGestionar(ctx)}
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
          controlaStock: producto.controlaStock,
          botonRapido: producto.botonRapido,
          presentaciones: producto.presentaciones,
        }}
      />
    </div>
  );
}
