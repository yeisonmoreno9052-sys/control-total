import type { Metadata } from "next";
import Link from "next/link";
import { Printer, Share2 } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { Button } from "@/components/ui/button";
import { obtenerPrenda } from "@/lib/datos/prendas";
import { formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { claveVariante } from "@/lib/inventario/prendas";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos, puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { AgregarTallas, CambiarPrecio } from "./formularios";

export const metadata: Metadata = { title: "Prenda · Control Total" };

export default async function DetallePrenda({ params, searchParams }: PageProps<"/inventario/prenda/[prendaId]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const { prendaId } = await params;
  const sp = await searchParams;
  const prenda = await obtenerPrenda(ctx, prendaId);
  if (!prenda) return <NoEncontrado />;
  const gestiona = puedeGestionar(ctx);
  const porClave = new Map(prenda.variantes.map((v) => [claveVariante(v.talla, v.color), v]));
  const filas: (string | null)[] = prenda.colores.length ? prenda.colores : [null];
  const precios = [...new Set(prenda.variantes.map((v) => v.precioVenta))];
  const primera = prenda.variantes.find((v) => v.activo);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={prenda.nombre}
        subtitulo={`${prenda.tallas.length} ${prenda.tallas.length === 1 ? "talla" : "tallas"}${prenda.colores.length ? ` · ${prenda.colores.length} ${prenda.colores.length === 1 ? "color" : "colores"}` : ""} · ${prenda.unidades.toLocaleString("es-CO")} en stock`}
        volver={{ href: "/inventario", texto: "Inventario" }}
        acciones={
          <>
            {primera && (
              <Button asChild variant="outline">
                <Link href={`/inventario/estado/${primera.id}`}>
                  <Share2 /> Compartir en Estado
                </Link>
              </Button>
            )}
            {gestiona && (
              <Button asChild>
                <Link href={`/etiqueta/prenda/${prendaId}`}>
                  <Printer /> Imprimir etiquetas
                </Link>
              </Button>
            )}
          </>
        }
      />

      {(sp.creada || sp.agregada) && (
        <p role="status" className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          {sp.creada ? "Prenda creada con todas sus tallas y colores." : "Listo, quedaron agregadas."}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cuántas hay de cada una</h2>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-suave">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground">{prenda.colores.length ? "Color" : ""}</th>
                {prenda.tallas.map((t) => (
                  <th key={t} className="min-w-16 px-2 py-2 text-base font-semibold">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((color) => (
                <tr key={color ?? "sin"} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    {color ?? "Stock"}
                  </th>
                  {prenda.tallas.map((talla) => {
                    const v = porClave.get(claveVariante(talla, color));
                    if (!v) return <td key={talla} className="p-2 text-muted-foreground">—</td>;
                    const n = Number(v.stock);
                    return (
                      <td key={talla} className="p-1.5">
                        <Link
                          href={`/inventario/${v.id}`}
                          title={`${v.nombre} · ${v.codigo}`}
                          className={cn(
                            "flex h-12 min-w-14 flex-col items-center justify-center rounded-lg border text-lg font-semibold tabular-nums hover:border-primary",
                            !v.activo && "opacity-40 line-through",
                            n <= 0 ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-background",
                          )}
                        >
                          {formatearCantidad(v.stock)}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">Toca un número para ver esa talla y color, ajustar su stock o editarla.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {gestiona && (
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-suave md:p-6">
            <h2 className="font-semibold">Precio de venta</h2>
            <p className="text-sm text-muted-foreground">
              {precios.length === 1
                ? `Todas las tallas a ${formatearPesos(precios[0])}.`
                : `Hay tallas con precios distintos (${precios.map(formatearPesos).join(", ")}).`}{" "}
              Aquí se lo cambias a todas de una vez.
            </p>
            <CambiarPrecio prendaId={prendaId} precio={precios.length === 1 ? precios[0] : 0} />
          </div>
        )}
        {puedeEditarProductos(ctx) && (
          <div className="space-y-3 rounded-xl border bg-card p-4 shadow-suave md:p-6">
            <h2 className="font-semibold">Agregar tallas o colores</h2>
            <p className="text-sm text-muted-foreground">Quedan con el mismo precio y su propio código.</p>
            <AgregarTallas prendaId={prendaId} tallas={prenda.tallas} colores={prenda.colores} existentes={[...porClave.keys()]} />
          </div>
        )}
      </section>
    </div>
  );
}
