import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, ChevronRight, Globe, ImageIcon, SearchX } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Button } from "@/components/ui/button";
import { colorMuestra } from "@/lib/catalogo/colores";
import { slugCatalogo } from "@/lib/datos/catalogo";
import { listarGaleriasCatalogo, MAX_FOTOS_EXTRA } from "@/lib/datos/fotos-catalogo";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { Buscador } from "../buscador";

export const metadata: Metadata = { title: "Fotos del catálogo · Control Total" };

/**
 * Sesión de fotos para el catálogo en línea: primero las prendas que solo tienen una foto.
 * Se escanea la etiqueta (o se busca) y se abre la sesión guiada de esa prenda.
 */
export default async function FotosCatalogoPagina({ searchParams }: PageProps<"/inventario/fotos-catalogo">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeEditarProductos(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;
  const volver = { href: "/inventario", texto: "Inventario" };

  if (!(await slugCatalogo(ctx, negocioId))) {
    return (
      <div className="max-w-3xl">
        <EncabezadoPagina titulo="Fotos del catálogo" volver={volver} />
        <EstadoVacio
          icono={Globe}
          titulo="Primero prende el catálogo en línea"
          descripcion="Estas fotos son para la página donde tus clientes ven las prendas. Préndela y vuelve aquí."
          accion={
            <Button asChild>
              <Link href="/configuracion/catalogo">Prender el catálogo</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const pagina = typeof sp.pagina === "string" ? Number(sp.pagina) : 1;
  const r = await listarGaleriasCatalogo(ctx, negocioId, { q, pagina });
  // Se escaneó una etiqueta: directo a la sesión de esa prenda.
  if (r.escaneado) redirect(`/inventario/fotos-catalogo/${r.escaneado}`);

  const enlace = (p: number) => `/inventario/fotos-catalogo?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(p) })}`;

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina
        titulo="Fotos del catálogo"
        subtitulo={
          r.faltan === 0
            ? "Todas las prendas tienen más de una foto. ¡Quedó lindo!"
            : `${r.faltan.toLocaleString("es-CO")} de ${r.total.toLocaleString("es-CO")} con una sola foto. Empieza por la primera.`
        }
        volver={volver}
      />

      <div className="mb-4">
        <Buscador abrirAlEscanear={false} placeholder="Escanea la etiqueta o busca la prenda…" />
      </div>

      {r.filas.length === 0 ? (
        <EstadoVacio
          icono={SearchX}
          titulo={q ? "No encontramos esa prenda" : "Todavía no hay productos"}
          descripcion={q ? "Revisa el nombre o escanea la etiqueta otra vez." : "Crea tus prendas en Inventario y vuelve aquí."}
          accion={
            q ? (
              <Button asChild variant="outline">
                <Link href="/inventario/fotos-catalogo">Ver todas</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {r.filas.map((f) => {
            const fotos = (f.principal ? 1 : 0) + f.extras;
            const hex = colorMuestra(f.color);
            return (
              <li key={`${f.productoId}`}>
                <Link
                  href={`/inventario/fotos-catalogo/${f.productoId}`}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-2.5 pr-3 shadow-suave transition hover:border-primary/50"
                >
                  <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {f.principal ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.principal} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="absolute inset-0 m-auto size-6 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate font-semibold">{f.nombre}</span>
                    {f.color && (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        {hex && <span className="size-3.5 rounded-full ring-1 ring-black/15" style={{ background: hex }} />}
                        {f.color}
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <span className="flex gap-1" aria-hidden>
                        {Array.from({ length: MAX_FOTOS_EXTRA + 1 }, (_, i) => (
                          <span key={i} className={`h-1.5 w-5 rounded-full ${i < fotos ? "bg-primary" : "bg-muted"}`} />
                        ))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fotos} {fotos === 1 ? "foto" : "fotos"}
                      </span>
                    </span>
                  </span>
                  {f.extras === 0 ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                      <Camera className="size-4" /> Fotos
                    </span>
                  ) : (
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {r.paginas > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          {r.pagina > 1 ? (
            <Button asChild variant="outline">
              <Link href={enlace(r.pagina - 1)}>Anteriores</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Página {r.pagina} de {r.paginas}
          </span>
          {r.pagina < r.paginas ? (
            <Button asChild variant="outline">
              <Link href={enlace(r.pagina + 1)}>Siguientes</Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
