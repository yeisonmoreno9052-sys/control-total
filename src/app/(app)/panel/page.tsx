import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Package, Receipt, Store, TriangleAlert } from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { contarProductos, contarStockBajo } from "@/lib/datos/productos";
import { formatearFecha } from "@/lib/formato";
import { tieneModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";

export const metadata: Metadata = { title: "Inicio · Control Total" };

export default async function Panel() {
  const ctx = await obtenerContexto();
  const negocio = ctx.negocioActivoId ? await obtenerNegocio(ctx, ctx.negocioActivoId) : null;
  const primerNombre = ctx.nombre.split(" ")[0];
  const conInventario = !!negocio && tieneModulo(ctx, "INVENTARIO");
  const [productos, stockBajo] = conInventario
    ? await Promise.all([contarProductos(ctx, negocio.id), contarStockBajo(ctx, negocio.id)])
    : [0, 0];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{formatearFecha(new Date())}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola, {primerNombre}</h1>
        {negocio && <p className="text-muted-foreground">{negocio.nombre}</p>}
      </div>

      {!negocio ? (
        <EstadoVacio
          icono={Store}
          titulo="Aún no tienes un negocio asignado"
          descripcion="Pídele al administrador que te dé acceso a un negocio para empezar a trabajar."
        />
      ) : (
        <div className="space-y-4">
          {conInventario && stockBajo > 0 && (
            <Link
              href="/inventario?bajo=1"
              className="flex items-center gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-200 dark:bg-amber-900">
                <TriangleAlert className="size-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">
                  {stockBajo.toLocaleString("es-CO")} {stockBajo === 1 ? "producto está" : "productos están"} con stock bajo
                </p>
                <p className="text-sm opacity-80">En {negocio.nombre}. Toca para ver cuáles.</p>
              </div>
              <ChevronRight className="size-5 opacity-60" />
            </Link>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {conInventario &&
              (productos === 0 ? (
                <EstadoVacio
                  icono={Package}
                  titulo="Todavía no hay productos"
                  descripcion={`Agrega o importa los productos de ${negocio.nombre} para empezar a vender.`}
                  accion={
                    puedeGestionar(ctx) && (
                      <Button asChild variant="outline">
                        <Link href="/inventario/importar">Importar productos</Link>
                      </Button>
                    )
                  }
                />
              ) : (
                <Link href="/inventario" className="flex items-center gap-4 rounded-xl border p-6 hover:bg-muted/40">
                  <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Package className="size-6" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Productos en inventario</p>
                    <p className="text-2xl font-semibold tabular-nums">{productos.toLocaleString("es-CO")}</p>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </Link>
              ))}
            <EstadoVacio
              icono={Receipt}
              titulo="Aún no hay ventas hoy"
              descripcion="La caja llega en la siguiente fase. Aquí verás cómo va el día."
            />
          </div>
        </div>
      )}
    </div>
  );
}
