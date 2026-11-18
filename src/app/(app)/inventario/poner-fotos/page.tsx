import type { Metadata } from "next";
import Link from "next/link";
import { Images } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCategorias } from "@/lib/datos/categorias";
import { buscarProductos, contarFotos } from "@/lib/datos/productos";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Buscador } from "../buscador";
import { FiltroCategoria } from "../filtro-categoria";
import { PonerFotos } from "./poner-fotos";

export const metadata: Metadata = { title: "Poner fotos · Control Total" };

type Parametros = { q?: string; categoria?: string; ver?: string; pagina?: string; ronda?: string };

function enlace(actual: Parametros, cambios: Partial<Parametros>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...actual, ...cambios })) if (v) p.set(k, v);
  const texto = p.toString();
  return texto ? `/inventario/poner-fotos?${texto}` : "/inventario/poner-fotos";
}

/**
 * Para recorrer la nevera o el mostrador con la tablet: primero los productos sin foto,
 * cada uno con su botón de cámara. La foto queda guardada apenas se toma.
 */
export default async function PonerFotosPagina({ searchParams }: PageProps<"/inventario/poner-fotos">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeEditarProductos(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;

  const sp = (await searchParams) as Parametros;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const parametros: Parametros = {
    q: texto(sp.q),
    categoria: texto(sp.categoria),
    ver: sp.ver === "con" ? "con" : undefined,
    pagina: texto(sp.pagina),
    ronda: texto(sp.ronda),
  };
  const modo = parametros.ver === "con" ? "con" : "sin";

  const [resultado, cuenta, categorias] = await Promise.all([
    buscarProductos(ctx, negocioId, {
      q: parametros.q,
      categoriaId: parametros.categoria,
      foto: modo,
      // Sin foto siempre se arranca por la primera página: las que se van llenando salen de la lista.
      pagina: modo === "con" ? Number(parametros.pagina) || 1 : 1,
    }),
    contarFotos(ctx, negocioId),
    listarCategorias(ctx, negocioId),
  ]);

  const hayMas = resultado.pagina < resultado.paginas;
  const siguiente =
    modo === "sin"
      ? enlace(parametros, { pagina: undefined, ronda: String((Number(parametros.ronda) || 0) + 1) })
      : enlace(parametros, { pagina: String(resultado.pagina + 1) });

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina
        titulo="Poner fotos"
        subtitulo={
          cuenta.sin === 0
            ? "Todos los productos tienen foto."
            : `Faltan ${cuenta.sin.toLocaleString("es-CO")} de ${(cuenta.sin + cuenta.con).toLocaleString("es-CO")} productos`
        }
        volver={{ href: "/inventario", texto: "Inventario" }}
      />

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border bg-card p-1 shadow-suave" role="tablist">
        {(
          [
            ["sin", `Sin foto (${cuenta.sin.toLocaleString("es-CO")})`],
            ["con", `Con foto (${cuenta.con.toLocaleString("es-CO")})`],
          ] as const
        ).map(([valor, nombre]) => (
          <Link
            key={valor}
            role="tab"
            aria-selected={modo === valor}
            href={enlace({ q: parametros.q, categoria: parametros.categoria }, { ver: valor === "con" ? "con" : undefined })}
            className={cn(
              "flex h-12 items-center justify-center rounded-lg text-base font-medium",
              modo === valor ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {nombre}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Buscador abrirAlEscanear={false} placeholder="Buscar o escanear un producto…" />
        <FiltroCategoria
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
          className="h-12 w-full sm:w-52"
        />
      </div>

      <PonerFotos
        key={`${modo}|${parametros.q ?? ""}|${parametros.categoria ?? ""}|${resultado.pagina}|${parametros.ronda ?? ""}`}
        modo={modo}
        productos={resultado.productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          codigo: p.codigo,
          categoria: p.categoria,
          fotoUrl: p.fotoUrl,
        }))}
        hayFiltros={!!(parametros.q || parametros.categoria)}
        siguiente={hayMas ? siguiente : null}
        quitarFiltros={enlace({ ver: parametros.ver }, {})}
        verConFoto={enlace({}, { ver: "con" })}
      />

      <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Images className="size-4 shrink-0" />
        <span>
          ¿Ya tienes las fotos guardadas con el nombre de cada producto?{" "}
          <Link href="/inventario/fotos" className="font-medium text-primary underline-offset-4 hover:underline">
            Súbelas todas de una vez
          </Link>
        </span>
      </p>
    </div>
  );
}
