import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, Plus } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Button } from "@/components/ui/button";
import { listarPromociones, type EstadoPromocion } from "@/lib/datos/promociones";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { TerminarPromocion } from "./terminar";

export const metadata: Metadata = { title: "Promociones · Control Total" };

const ESTADOS: Record<EstadoPromocion, { texto: string; clase: string }> = {
  vigente: { texto: "Activa hoy", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  programada: { texto: "Programada", clase: "bg-accent text-accent-foreground" },
  terminada: { texto: "Terminada", clase: "bg-muted text-muted-foreground" },
};

const dma = (d: string) => d.split("-").reverse().join("/");

export default async function Promociones({ searchParams }: PageProps<"/inventario/promociones">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const sp = await searchParams;
  const promociones = await listarPromociones(ctx, ctx.negocioActivoId);

  return (
    <div className="max-w-3xl space-y-6">
      <EncabezadoPagina
        titulo="Promociones"
        subtitulo="Descuentos con fecha: la caja los pone solos esos días y después vuelve al precio normal."
        volver={{ href: "/inventario", texto: "Inventario" }}
        acciones={
          <Button asChild>
            <Link href="/inventario/promociones/nueva">
              <Plus /> Nueva promoción
            </Link>
          </Button>
        }
      />
      {typeof sp.creada === "string" && (
        <p role="status" className="rounded-md bg-accent px-3 py-2 text-accent-foreground">
          Promoción guardada para {sp.creada} {sp.creada === "1" ? "producto" : "productos"}.
        </p>
      )}
      {promociones.length === 0 ? (
        <EstadoVacio
          icono={BadgePercent}
          titulo="Todavía no hay promociones"
          descripcion="Crea una, escoge las prendas y las fechas, y la caja hace el resto."
          accion={
            <Button asChild>
              <Link href="/inventario/promociones/nueva">Nueva promoción</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {promociones.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-suave">
              <div className="min-w-0">
                <p className="text-lg font-semibold">
                  {p.nombre} <span className="text-primary">· {p.descuento}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Del {dma(p.desde)} al {dma(p.hasta)} · {p.productos.toLocaleString("es-CO")} {p.productos === 1 ? "producto" : "productos"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-3 py-1 text-sm font-medium", ESTADOS[p.estado].clase)}>{ESTADOS[p.estado].texto}</span>
                {p.estado !== "terminada" && <TerminarPromocion id={p.id} nombre={p.nombre} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
