import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { slugCatalogo } from "@/lib/datos/catalogo";
import { MAX_FOTOS_EXTRA, obtenerGaleria, siguienteSinFotos } from "@/lib/datos/fotos-catalogo";
import { obtenerProducto } from "@/lib/datos/productos";
import { normalizar } from "@/lib/inventario/prendas";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { SesionFotos } from "./sesion-fotos";

export const metadata: Metadata = { title: "Sesión de fotos · Control Total" };

/** Sesión guiada de una prenda en un color: frente, espalda, detalle y puesta. */
export default async function SesionFotosPagina({ params }: PageProps<"/inventario/fotos-catalogo/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeEditarProductos(ctx)) return <SinPermiso />;
  const { id } = await params;
  const producto = await obtenerProducto(ctx, id);
  if (!producto) return <NoEncontrado />;
  const slug = await slugCatalogo(ctx, producto.negocioId);
  if (!slug) redirect("/inventario/fotos-catalogo");

  const [galeria, siguiente] = await Promise.all([obtenerGaleria(ctx, producto.id), siguienteSinFotos(ctx, producto.negocioId, producto.id)]);
  if (!galeria) return <NoEncontrado />;
  const mismo = (c: string | null) => normalizar(c ?? "") === normalizar(producto.color ?? "");
  const propio = galeria.find((g) => mismo(g.color)) ?? galeria[0];

  return (
    <SesionFotos
      // Al cambiar de prenda o de color la sesión arranca de cero.
      key={propio.productoId}
      productoId={propio.productoId}
      nombre={producto.prendaId ? (producto.prenda ?? producto.nombre) : producto.nombre}
      color={propio.color}
      principal={propio.principal}
      extras={propio.extras.length}
      maximo={MAX_FOTOS_EXTRA}
      otrosColores={galeria
        .filter((g) => g !== propio)
        .map((g) => ({ productoId: g.productoId, color: g.color ?? "Sin color", fotos: (g.principal ? 1 : 0) + g.extras.length }))}
      siguiente={siguiente}
      verEnCatalogo={`/c/${slug}/p/${producto.prendaId ?? producto.id}`}
    />
  );
}
