import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCategorias, obtenerMargenNegocio } from "@/lib/datos/categorias";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioProducto } from "../formulario-producto";

export const metadata: Metadata = { title: "Nuevo producto · Control Total" };

export default async function NuevoProducto({ searchParams }: PageProps<"/inventario/nuevo">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const { creado } = await searchParams;
  const [categorias, margen] = await Promise.all([
    listarCategorias(ctx, ctx.negocioActivoId),
    obtenerMargenNegocio(ctx, ctx.negocioActivoId),
  ]);

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina titulo="Nuevo producto" volver={{ href: "/inventario", texto: "Inventario" }} />
      {creado && (
        <p role="status" className="mb-6 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          Producto creado. Puedes seguir con el siguiente.
        </p>
      )}
      <FormularioProducto key={String(creado)} categorias={categorias} margenNegocio={margen} />
    </div>
  );
}
