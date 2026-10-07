import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { SelectorNegocioReporte } from "@/components/reportes/selector-negocio-reporte";
import { SelectorPeriodo } from "@/components/reportes/selector-periodo";
import { VistaReporte } from "@/components/reportes/vista-reporte";
import { Button } from "@/components/ui/button";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { reporteDesdeParametros, VISTAS } from "@/lib/reportes/armar";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reportes · Control Total" };

export default async function Reportes({ searchParams }: PageProps<"/reportes">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "REPORTES");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const p = await searchParams;
  // Un negocio ajeno en la dirección se rechaza en el servidor.
  const datos = await reporteDesdeParametros(ctx, ctx.negocioActivoId, p).catch((error) => {
    if (error instanceof AccesoDenegado) return null;
    throw error;
  });
  if (!datos) return <SinPermiso />;
  const { vista, negocios, periodo, reporte } = datos;

  // Misma dirección para exportar: negocio, fechas y vista.
  const consulta = new URLSearchParams({ vista, negocio: negocios.valor });
  if (periodo.preset === "libre") {
    consulta.set("desde", periodo.desde);
    consulta.set("hasta", periodo.hasta);
  } else consulta.set("periodo", periodo.preset);
  const enlace = (v: string) => {
    const c = new URLSearchParams(consulta);
    c.set("vista", v);
    return `/reportes?${c.toString()}`;
  };

  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes"
        subtitulo={
          <>
            {negocios.nombre}
            {reporte.periodo && ` · ${reporte.periodo}`}
          </>
        }
        acciones={
          <>
            <Button asChild variant="outline">
              <a href={`/api/reportes/excel?${consulta.toString()}`} download>
                <FileSpreadsheet /> Excel
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/reporte-impresion?${consulta.toString()}&imprimir=1`} target="_blank" rel="noopener">
                <Printer /> Imprimir o PDF
              </a>
            </Button>
          </>
        }
      />

      <nav aria-label="Reportes" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {VISTAS.map((v) => (
          <Link
            key={v.valor}
            href={enlace(v.valor)}
            scroll={false}
            aria-current={v.valor === vista ? "page" : undefined}
            className={cn(
              "flex h-10 flex-1 items-center justify-center rounded-lg px-3 text-sm font-medium whitespace-nowrap",
              v.valor === vista ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v.nombre}
          </Link>
        ))}
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        {vista !== "inventario" ? (
          <SelectorPeriodo periodo={periodo} />
        ) : (
          <p className="text-sm text-muted-foreground">Inventario de hoy.</p>
        )}
        <SelectorNegocioReporte opciones={negocios.opciones} valor={negocios.valor} />
      </div>

      <VistaReporte reporte={reporte} />
    </div>
  );
}
