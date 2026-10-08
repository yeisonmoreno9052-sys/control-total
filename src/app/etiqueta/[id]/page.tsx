import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerProducto } from "@/lib/datos/productos";
import { codigoBarrasSvg, textoParaBarras } from "@/lib/etiquetas/codigo-barras";
import { formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { BarraEtiqueta } from "./barra";

export const metadata: Metadata = { title: "Etiqueta · Control Total" };

// Etiquetas de 60 × 30 mm. En la impresora de recibos (80 mm) sale una por fila;
// en una hoja carta salen varias por fila. Se recortan y se pegan en la pieza.
export default function PaginaEtiqueta(props: PageProps<"/etiqueta/[id]">) {
  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-6 print:bg-white print:p-0">
      <style>{`@page { margin: 4mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <Suspense fallback={<div className="mx-auto h-40 max-w-md animate-pulse rounded bg-muted" />}>
        <Etiquetas {...props} />
      </Suspense>
    </main>
  );
}

async function Etiquetas({ params, searchParams }: PageProps<"/etiqueta/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const { id } = await params;
  const sp = await searchParams;
  const producto = await obtenerProducto(ctx, id);
  if (!producto) notFound();

  const texto = textoParaBarras(producto);
  const svg = codigoBarrasSvg(texto);
  const pedidas = Number.parseInt(typeof sp.copias === "string" ? sp.copias : "", 10);
  // Recién comprada: una etiqueta por pieza. Si no, una.
  const porDefecto = sp.nueva === "1" ? Math.floor(Number(producto.stock)) : 1;
  const copias = Math.min(100, Math.max(1, Number.isFinite(pedidas) ? pedidas : porDefecto));

  return (
    <>
      <BarraEtiqueta
        productoId={producto.id}
        copias={copias}
        nueva={sp.nueva === "1" ? producto.codigo : null}
        imprimir={sp.imprimir === "1"}
      />
      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-[3mm] print:max-w-none print:justify-start">
        {Array.from({ length: copias }, (_, i) => (
          <article
            key={i}
            className="flex h-[30mm] w-[60mm] break-inside-avoid flex-col justify-between overflow-hidden rounded-sm border border-dashed border-neutral-400 bg-white px-[2.5mm] py-[2mm] font-sans text-black"
          >
            <p className="line-clamp-2 text-[9pt] leading-tight font-semibold">{producto.nombre}</p>
            {svg ? (
              <div
                className="mx-auto h-[9mm] w-full [&>svg]:h-full [&>svg]:w-full"
                // El SVG lo genera el servidor a partir del código; no lleva texto de la persona sin escapar.
                dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg preserveAspectRatio="none" ') }}
              />
            ) : (
              <p className="text-center text-[7pt]">Este código no se puede pasar a barras</p>
            )}
            <div className="flex items-end justify-between gap-2">
              <span className="font-mono text-[8pt]">{texto}</span>
              <span className="text-[13pt] leading-none font-bold tabular-nums">{formatearPesos(producto.precioVenta)}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
