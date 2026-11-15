import type { Metadata } from "next";
import Link from "next/link";
import { PackagePlus, Ruler, SearchX, Shirt } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { tallasDisponibles, type DisponibilidadPrenda } from "@/lib/datos/prendas";
import { formatearPesos } from "@/lib/formato";
import { claveVariante } from "@/lib/inventario/prendas";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Buscador } from "../buscador";

export const metadata: Metadata = { title: "Tallas disponibles · Control Total" };

// Para el mostrador: "¿hay esta referencia en talla M?" Se escribe o se escanea y sale todo de una vez.
export default async function TallasDisponibles({ searchParams }: PageProps<"/inventario/tallas">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  if (!ctx.negocioActivoId) {
    return <EstadoVacio icono={Shirt} titulo="Sin negocio" descripcion="No tienes un negocio asignado." />;
  }
  const prendas = q.trim() ? await tallasDisponibles(ctx, ctx.negocioActivoId, q) : [];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Tallas disponibles"
        subtitulo="Escribe la referencia o escanea una etiqueta y mira qué tallas y colores quedan."
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      <Buscador abrirAlEscanear={false} placeholder="Referencia, nombre o código…" />

      {!q.trim() ? (
        <EstadoVacio icono={Ruler} titulo="¿Qué referencia buscas?" descripcion='Por ejemplo "jeans cello" o "PR-0001".' />
      ) : prendas.length === 0 ? (
        <EstadoVacio icono={SearchX} titulo="No encontramos esa referencia" descripcion="Revisa cómo está escrita o prueba con otra palabra." />
      ) : (
        <div className="space-y-4">
          {prendas.map((p) => (
            <TarjetaPrenda key={p.prendaId} prenda={p} volver={`/inventario/tallas?q=${encodeURIComponent(q)}`} llegada={puedeEditarProductos(ctx)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaPrenda({ prenda, volver, llegada }: { prenda: DisponibilidadPrenda; volver: string; llegada: boolean }) {
  const porClave = new Map(prenda.variantes.map((v) => [claveVariante(v.talla, v.color), v]));
  const filas: (string | null)[] = prenda.colores.length ? prenda.colores : [null];
  const hay = prenda.tallas.filter((t) => prenda.variantes.some((v) => v.talla === t && v.stock > 0));
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-suave">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/inventario/prenda/${prenda.prendaId}`} className="text-lg font-semibold hover:underline">
          {prenda.nombre}
        </Link>
        <span className="text-sm text-muted-foreground">
          {prenda.precios.map(formatearPesos).join(" · ")} · {prenda.unidades.toLocaleString("es-CO")}{" "}
          {prenda.unidades === 1 ? "unidad" : "unidades"}
        </span>
      </div>
      <p className={cn("font-medium", hay.length ? "text-foreground" : "text-destructive")}>
        {hay.length ? `Hay en talla ${hay.join(", ")}` : "Agotada en todas las tallas"}
      </p>
      <div className="space-y-2">
        {filas.map((color) => (
          <div key={color ?? "sin"} className="flex flex-wrap items-center gap-2">
            {color && <span className="w-full text-sm font-medium text-muted-foreground sm:w-24 sm:shrink-0">{color}</span>}
            {prenda.tallas.map((talla) => {
              const v = porClave.get(claveVariante(talla, color));
              if (!v) return null;
              const agotada = v.stock <= 0;
              return (
                <Link
                  key={talla}
                  href={`/inventario/${v.id}`}
                  title={agotada ? "Agotada" : `Quedan ${v.stock}`}
                  className={cn(
                    "flex min-w-14 flex-col items-center rounded-lg border px-2.5 py-1 leading-tight",
                    agotada
                      ? "border-dashed text-muted-foreground line-through opacity-60"
                      : "border-primary bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  <span className="text-lg font-bold">{talla}</span>
                  <span className="text-xs">{agotada ? "agotada" : `quedan ${v.stock}`}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      {llegada && (
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href={`/inventario/prenda/${prenda.prendaId}/llegada?volver=${encodeURIComponent(volver)}`}>
            <PackagePlus /> Llegó mercancía
          </Link>
        </Button>
      )}
    </section>
  );
}
