import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, FolderTree, Package, Plus, SearchX, TriangleAlert } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listarCategorias } from "@/lib/datos/categorias";
import { buscarProductos, type ProductoVista } from "@/lib/datos/productos";
import { formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Buscador } from "./buscador";
import { FiltroCategoria } from "./filtro-categoria";

export const metadata: Metadata = { title: "Inventario · Control Total" };

type Parametros = { q?: string; categoria?: string; bajo?: string; pagina?: string };

function enlace(actual: Parametros, cambios: Partial<Parametros>) {
  const p = new URLSearchParams();
  const todo = { ...actual, ...cambios };
  for (const [k, v] of Object.entries(todo)) if (v) p.set(k, v);
  const texto = p.toString();
  return texto ? `/inventario?${texto}` : "/inventario";
}

export default async function Inventario({ searchParams }: PageProps<"/inventario">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const sp = (await searchParams) as Parametros;
  const parametros: Parametros = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    categoria: typeof sp.categoria === "string" ? sp.categoria : undefined,
    bajo: sp.bajo === "1" ? "1" : undefined,
    pagina: typeof sp.pagina === "string" ? sp.pagina : undefined,
  };

  if (!ctx.negocioActivoId) {
    return <EstadoVacio icono={Package} titulo="Sin negocio" descripcion="No tienes un negocio asignado." />;
  }
  const negocioId = ctx.negocioActivoId;
  const gestiona = puedeGestionar(ctx);

  const [resultado, categorias] = await Promise.all([
    buscarProductos(ctx, negocioId, {
      q: parametros.q,
      categoriaId: parametros.categoria,
      stockBajo: parametros.bajo === "1",
      pagina: Number(parametros.pagina) || 1,
    }),
    listarCategorias(ctx, negocioId),
  ]);
  const hayFiltros = !!(parametros.q || parametros.categoria || parametros.bajo);

  return (
    <div>
      <EncabezadoPagina
        titulo="Inventario"
        subtitulo={`${resultado.total.toLocaleString("es-CO")} ${resultado.total === 1 ? "producto" : "productos"}${hayFiltros ? " encontrados" : ""}`}
        acciones={
          gestiona && (
            <>
              <Button asChild variant="outline">
                <Link href="/inventario/categorias">
                  <FolderTree /> Categorías
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/inventario/importar">
                  <FileSpreadsheet /> Importar
                </Link>
              </Button>
              <Button asChild>
                <Link href="/inventario/nuevo">
                  <Plus /> Nuevo producto
                </Link>
              </Button>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <Buscador />
        <div className="flex gap-2">
          <FiltroCategoria categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))} />
          <Button
            asChild
            variant={parametros.bajo ? "default" : "outline"}
            className="h-12 shrink-0"
          >
            <Link href={enlace(parametros, { bajo: parametros.bajo ? undefined : "1", pagina: undefined })}>
              <TriangleAlert /> Stock bajo
            </Link>
          </Button>
        </div>
      </div>

      {resultado.productos.length === 0 ? (
        hayFiltros ? (
          <EstadoVacio
            icono={SearchX}
            titulo="No encontramos productos"
            descripcion="Prueba con otra palabra o quita los filtros."
            accion={
              <Button asChild variant="outline">
                <Link href="/inventario">Quitar filtros</Link>
              </Button>
            }
          />
        ) : (
          <EstadoVacio
            icono={Package}
            titulo="Todavía no hay productos"
            descripcion={gestiona ? "Agrega uno por uno o importa tu inventario desde Excel." : "Cuando el administrador cargue productos, aparecerán aquí."}
            accion={
              gestiona && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/inventario/nuevo">
                      <Plus /> Nuevo producto
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/inventario/importar">
                      <FileSpreadsheet /> Importar desde Excel
                    </Link>
                  </Button>
                </div>
              )
            }
          />
        )
      ) : (
        <>
          <TablaProductos productos={resultado.productos} verCosto={gestiona} />
          {resultado.paginas > 1 && (
            <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Páginas">
              <Button asChild variant="outline" className={cn(resultado.pagina <= 1 && "pointer-events-none opacity-50")}>
                <Link href={enlace(parametros, { pagina: String(resultado.pagina - 1) })}>Anterior</Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {resultado.pagina} de {resultado.paginas}
              </span>
              <Button
                asChild
                variant="outline"
                className={cn(resultado.pagina >= resultado.paginas && "pointer-events-none opacity-50")}
              >
                <Link href={enlace(parametros, { pagina: String(resultado.pagina + 1) })}>Siguiente</Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Stock({ p }: { p: ProductoVista }) {
  return (
    <span className={cn("tabular-nums", p.stockBajo && "font-semibold text-destructive")}>
      {formatearCantidad(p.stock)} <span className="text-muted-foreground font-normal">{UNIDADES[p.unidad].corto}</span>
    </span>
  );
}

function TablaProductos({ productos, verCosto }: { productos: ProductoVista[]; verCosto: boolean }) {
  return (
    <>
      {/* Celular: tarjetas */}
      <ul className="divide-y rounded-xl border md:hidden">
        {productos.map((p) => (
          <li key={p.id}>
            <Link href={`/inventario/${p.id}`} className="flex items-center gap-3 p-4 active:bg-muted">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">{p.nombre}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {p.codigo}
                  {p.categoria ? ` · ${p.categoria}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatearPesos(p.precioVenta)}</p>
                <p className="text-sm">
                  <Stock p={p} />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Computador: tabla */}
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              {verCosto && <th className="px-4 py-3 text-right font-medium">Costo</th>}
              <th className="px-4 py-3 text-right font-medium">Precio</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {productos.map((p) => (
              <tr key={p.id} className="relative hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/inventario/${p.id}`} className="font-medium after:absolute after:inset-0">
                    {p.nombre}
                  </Link>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{p.codigo}</span>
                    {p.condicion === "DE_SEGUNDA" && <Badge variant="secondary">De segunda</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.categoria ?? "—"}</td>
                {verCosto && <td className="px-4 py-3 text-right tabular-nums">{formatearPesos(p.costo ?? 0)}</td>}
                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatearPesos(p.precioVenta)}</td>
                <td className="px-4 py-3 text-right">
                  <Stock p={p} />
                  {p.stockBajo && (
                    <div>
                      <Badge variant="aviso">Stock bajo</Badge>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
