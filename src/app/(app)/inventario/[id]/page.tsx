import type { Metadata } from "next";
import Link from "next/link";
import { History, Pencil, SlidersHorizontal, Truck } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { historialComprasProducto } from "@/lib/datos/compras";
import { listarMovimientos, obtenerProducto } from "@/lib/datos/productos";
import { formatearDia, formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { calcularMargen } from "@/lib/inventario/precios";
import { CONDICIONES, MOTIVOS_AJUSTE, TIPOS_MOVIMIENTO, UNIDADES } from "@/lib/inventario/unidades";
import { exigirModulo, tieneModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { BotonActivo } from "./boton-activo";

export const metadata: Metadata = { title: "Producto · Control Total" };

export default async function DetalleProducto({ params, searchParams }: PageProps<"/inventario/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const { id } = await params;
  const { ajustado } = await searchParams;
  const producto = await obtenerProducto(ctx, id);
  if (!producto) return <NoEncontrado />;
  const gestiona = puedeGestionar(ctx);
  const { movimientos, total } = await listarMovimientos(ctx, id);
  // El historial de compras muestra costos: solo para quien gestiona.
  const compras = gestiona && tieneModulo(ctx, "PROVEEDORES") ? await historialComprasProducto(ctx, id) : [];
  const unidad = UNIDADES[producto.unidad];
  const margen = producto.costo !== undefined ? calcularMargen(producto.costo, producto.precioVenta) : null;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={producto.nombre}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {producto.codigo}
            {producto.codigoBarras && <span>· {producto.codigoBarras}</span>}
            {producto.condicion === "DE_SEGUNDA" && <Badge variant="secondary">{CONDICIONES.DE_SEGUNDA}</Badge>}
            {!producto.activo && <Badge variant="destructive">Desactivado</Badge>}
          </span>
        }
        volver={{ href: "/inventario", texto: "Inventario" }}
        acciones={
          gestiona && (
            <>
              <Button asChild variant="outline">
                <Link href={`/inventario/${id}/editar`}>
                  <Pencil /> Editar
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/inventario/${id}/ajustar`}>
                  <SlidersHorizontal /> Ajustar stock
                </Link>
              </Button>
            </>
          )
        }
      />

      {ajustado && (
        <p role="status" className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          Stock ajustado.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato titulo="Stock" destacado={producto.stockBajo}>
          {formatearCantidad(producto.stock)} {unidad.corto}
          {producto.stockBajo && <Badge variant="aviso" className="ml-2 align-middle">Stock bajo</Badge>}
        </Dato>
        <Dato titulo="Precio de venta">{formatearPesos(producto.precioVenta)}</Dato>
        {producto.costo !== undefined && <Dato titulo="Costo">{formatearPesos(producto.costo)}</Dato>}
        {margen && (
          <Dato titulo="Ganancia">
            {formatearPesos(margen.ganancia)}{" "}
            <span className="text-base font-normal text-muted-foreground">
              {margen.porcentaje.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %
            </span>
          </Dato>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-3 rounded-xl border p-4 text-sm sm:grid-cols-2 md:p-6">
        <Fila titulo="Categoría">{producto.categoria ?? "Sin categoría"}</Fila>
        <Fila titulo="Unidad">
          {unidad.nombre}
          {producto.fraccionado ? " · se vende fraccionado" : ""}
        </Fila>
        <Fila titulo="Stock mínimo">
          {formatearCantidad(producto.stockMinimo)} {unidad.corto}
        </Fila>
        <Fila titulo="IVA">{producto.porcentajeIva} %</Fila>
        {producto.descripcion && <Fila titulo="Descripción">{producto.descripcion}</Fila>}
      </dl>

      {compras.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Truck className="size-5 text-muted-foreground" /> Compras
          </h2>
          <ul className="divide-y rounded-xl border">
            {compras.map((c) => (
              <li key={c.id} className={cn(c.anulada && "opacity-60")}>
                <Link href={`/proveedores/facturas/${c.facturaId}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">
                      {c.proveedor} · factura {c.numero}
                      {c.anulada && <span className="ml-2 text-sm text-destructive">Anulada</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatearDia(c.fecha)} · {formatearCantidad(c.cantidad)} {unidad.corto} a {formatearPesos(c.costoUnitario)}
                    </p>
                  </div>
                  <p className="text-right text-sm text-muted-foreground tabular-nums">
                    Costo {formatearPesos(c.costoAntes)} → <span className="font-medium text-foreground">{formatearPesos(c.costoDespues)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <History className="size-5 text-muted-foreground" /> Movimientos
          <span className="text-sm font-normal text-muted-foreground">({total})</span>
        </h2>
        {movimientos.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Este producto aún no tiene movimientos de stock.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {movimientos.map((m) => {
              const entra = !m.cantidad.startsWith("-");
              return (
                <li key={m.id} className="flex items-start gap-4 p-4 text-sm">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">
                      {TIPOS_MOVIMIENTO[m.tipo]}
                      {m.motivo ? ` · ${MOTIVOS_AJUSTE[m.motivo]}` : ""}
                    </p>
                    {m.nota && <p className="text-muted-foreground">{m.nota}</p>}
                    <p className="text-muted-foreground">
                      {formatearFecha(m.creadoEn)} {formatearHora(m.creadoEn)} · {m.usuario}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className={cn("font-semibold", entra ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
                      {entra ? "+" : "−"}
                      {formatearCantidad(m.cantidad.replace("-", ""))}
                    </p>
                    <p className="text-muted-foreground">
                      {formatearCantidad(m.stockAntes)} → {formatearCantidad(m.stockDespues)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {gestiona && (
        <div className="border-t pt-6">
          <BotonActivo id={producto.id} activo={producto.activo} />
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, children, destacado }: { titulo: string; children: React.ReactNode; destacado?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", destacado && "border-amber-300 dark:border-amber-800")}>
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{children}</p>
    </div>
  );
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="text-right font-medium sm:text-left">{children}</dd>
    </div>
  );
}
