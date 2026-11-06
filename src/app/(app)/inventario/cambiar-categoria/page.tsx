import type { Metadata } from "next";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Button } from "@/components/ui/button";
import { listarCategorias } from "@/lib/datos/categorias";
import { buscarProductos, SIN_CATEGORIA } from "@/lib/datos/productos";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Buscador } from "../buscador";
import { FiltroCategoria } from "../filtro-categoria";
import { ListaCambiarCategoria } from "./lista";

export const metadata: Metadata = { title: "Cambiar categoría · Control Total" };

type Parametros = { q?: string; categoria?: string; pagina?: string };

function enlace(actual: Parametros, pagina: number) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...actual, pagina: String(pagina) })) if (v) p.set(k, v);
  return `/inventario/cambiar-categoria?${p.toString()}`;
}

/**
 * Marcar varios productos y pasarlos a una categoría de una vez. Desde el inventario se llega
 * con el filtro "Sin categoría", que es lo que normalmente se quiere ordenar.
 */
export default async function CambiarCategoria({ searchParams }: PageProps<"/inventario/cambiar-categoria">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const sp = await searchParams;
  const parametros: Parametros = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    categoria: typeof sp.categoria === "string" ? sp.categoria : undefined,
    pagina: typeof sp.pagina === "string" ? sp.pagina : undefined,
  };
  const [resultado, categorias] = await Promise.all([
    buscarProductos(ctx, ctx.negocioActivoId, {
      q: parametros.q,
      categoriaId: parametros.categoria,
      pagina: Number(parametros.pagina) || 1,
    }),
    listarCategorias(ctx, ctx.negocioActivoId),
  ]);
  const opciones = categorias.map((c) => ({ id: c.id, nombre: c.nombre }));

  return (
    <div className="space-y-4 pb-28">
      <EncabezadoPagina
        titulo="Cambiar categoría"
        subtitulo="Marca los productos y elige a qué categoría pasan."
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Buscador />
        <FiltroCategoria categorias={opciones} />
      </div>

      {resultado.productos.length === 0 ? (
        <EstadoVacio
          icono={PackageCheck}
          titulo={parametros.categoria === SIN_CATEGORIA && !parametros.q ? "Todos tienen categoría" : "No encontramos productos"}
          descripcion={
            parametros.categoria === SIN_CATEGORIA && !parametros.q
              ? "No queda ningún producto sin categoría. Busca uno por nombre si quieres cambiarlo."
              : "Prueba con otra palabra o elige otra categoría."
          }
          accion={
            <Button asChild variant="outline">
              <Link href="/inventario">Volver al inventario</Link>
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {resultado.total.toLocaleString("es-CO")} {resultado.total === 1 ? "producto" : "productos"}
            {parametros.categoria === SIN_CATEGORIA ? " sin categoría" : ""}
          </p>
          <ListaCambiarCategoria
            key={`${parametros.q ?? ""}|${parametros.categoria ?? ""}|${resultado.pagina}`}
            productos={resultado.productos.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              codigo: p.codigo,
              categoria: p.categoria,
            }))}
            categorias={opciones}
          />
          {resultado.paginas > 1 && (
            <nav className="flex items-center justify-between gap-3" aria-label="Páginas">
              <Button asChild variant="outline" className={cn(resultado.pagina <= 1 && "pointer-events-none opacity-50")}>
                <Link href={enlace(parametros, resultado.pagina - 1)}>Anterior</Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {resultado.pagina} de {resultado.paginas}
              </span>
              <Button
                asChild
                variant="outline"
                className={cn(resultado.pagina >= resultado.paginas && "pointer-events-none opacity-50")}
              >
                <Link href={enlace(parametros, resultado.pagina + 1)}>Siguiente</Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
