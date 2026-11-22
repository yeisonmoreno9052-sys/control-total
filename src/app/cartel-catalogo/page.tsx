import type { Metadata } from "next";
import { Suspense } from "react";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerConfigCatalogo } from "@/lib/datos/catalogo";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { qrSvg } from "@/lib/etiquetas/qr";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { urlPublica } from "@/lib/url-publica";
import { BarraImpresion } from "../reporte-impresion/barra";

export const metadata: Metadata = { title: "Cartel del catálogo · Control Total" };

// Cartel para la vitrina, el espejo o la caja: "Escanea y mira todo el catálogo". Media carta.
export default function PaginaCartel() {
  return (
    <main className="min-h-dvh bg-muted/40 px-3 py-6 print:bg-white print:p-0">
      <style>{`@page { size: letter; margin: 12mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <Suspense fallback={<div className="mx-auto h-96 max-w-xl animate-pulse rounded bg-muted" />}>
        <Cartel />
      </Suspense>
    </main>
  );
}

async function Cartel() {
  const ctx = await obtenerContexto();
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const [config, empresa, base] = await Promise.all([obtenerConfigCatalogo(ctx, ctx.negocioActivoId), obtenerEmpresa(ctx), urlPublica()]);
  if (!config?.activo) {
    return <p className="mx-auto max-w-xl rounded-xl bg-card p-6 text-center">Primero prende el catálogo en Configuración → Catálogo en línea.</p>;
  }
  const link = `${base}/c/${config.slug}`;
  const qr = qrSvg(link);
  return (
    <>
      <BarraImpresion imprimir={false} />
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 rounded-[2rem] border-[6px] border-black bg-white px-8 py-10 text-center text-black print:break-inside-avoid">
        {empresa?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- logo de la empresa
          <img src={empresa.logoUrl} alt="" className="size-28 rounded-full object-contain" />
        )}
        <div className="space-y-1">
          <p className="text-4xl font-extrabold tracking-tight">Mira todo nuestro catálogo</p>
          <p className="text-xl">Tallas, colores y precios. Pide por WhatsApp.</p>
        </div>
        {qr && <div className="size-72 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />}
        <p className="text-lg font-semibold">📷 Abre la cámara de tu celular y apunta aquí</p>
        <p className="font-mono text-lg break-all">{link.replace(/^https?:\/\//, "")}</p>
        <p className="text-2xl font-bold">{config.nombreNegocio}</p>
      </div>
    </>
  );
}
