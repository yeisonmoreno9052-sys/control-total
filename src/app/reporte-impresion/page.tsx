import type { Metadata } from "next";
import { Suspense } from "react";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { VistaReporte } from "@/components/reportes/vista-reporte";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { formatearFecha, formatearHora } from "@/lib/formato";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { reporteDesdeParametros } from "@/lib/reportes/armar";
import { obtenerContexto } from "@/lib/sesion";
import { BarraImpresion } from "./barra";

export const metadata: Metadata = { title: "Reporte · Control Total" };

// Versión limpia de un reporte, en hoja carta, para imprimir o guardar como PDF desde el navegador.
export default function PaginaImpresion(props: PageProps<"/reporte-impresion">) {
  return (
    <main className="min-h-dvh bg-muted/40 px-3 py-6 print:bg-white print:p-0">
      <style>{`@page { size: letter; margin: 14mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <Suspense fallback={<div className="mx-auto h-96 max-w-4xl animate-pulse rounded bg-muted" />}>
        <Impresion {...props} />
      </Suspense>
    </main>
  );
}

async function Impresion({ searchParams }: PageProps<"/reporte-impresion">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "REPORTES");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const p = await searchParams;
  const [datos, empresa] = await Promise.all([
    reporteDesdeParametros(ctx, ctx.negocioActivoId, p).catch((error) => {
      if (error instanceof AccesoDenegado) return null;
      throw error;
    }),
    obtenerEmpresa(ctx),
  ]);
  if (!datos) return <SinPermiso />;
  const { reporte } = datos;
  const ahora = new Date();
  return (
    <>
      <BarraImpresion imprimir={p.imprimir === "1"} />
      <article className="mx-auto max-w-4xl rounded-xl bg-background p-6 shadow-sm print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="mb-5 flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-semibold">{reporte.titulo}</h1>
            <p className="text-muted-foreground">
              {reporte.negocio}
              {reporte.periodo && ` · ${reporte.periodo}`}
            </p>
          </div>
          <div className="text-right">
            {empresa?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={empresa.logoUrl} alt={empresa.nombre} className="ml-auto max-h-12 max-w-40 object-contain" />
            ) : (
              <p className="font-semibold">{empresa?.nombre}</p>
            )}
          </div>
        </header>
        <VistaReporte reporte={reporte} impresion />
        <footer className="mt-6 flex justify-between border-t pt-3 text-xs text-muted-foreground">
          <span>
            Generado el {formatearFecha(ahora)} a las {formatearHora(ahora)} por {ctx.nombre}
          </span>
          <span>Control Total · Desarrollado por EMY TELECOM</span>
        </footer>
      </article>
    </>
  );
}
