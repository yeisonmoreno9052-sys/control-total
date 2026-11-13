import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerPrenda } from "@/lib/datos/prendas";
import { codigoBarrasSvg, textoParaBarras } from "@/lib/etiquetas/codigo-barras";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { HojaPrenda } from "./hoja";

export const metadata: Metadata = { title: "Etiquetas de la prenda · Control Total" };

// Todas las etiquetas de una prenda de una vez: una por cada pieza que hay de cada talla y color.
export default function PaginaEtiquetasPrenda(props: PageProps<"/etiqueta/prenda/[prendaId]">) {
  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-6 print:bg-white print:p-0">
      <Suspense fallback={<div className="mx-auto h-40 max-w-md animate-pulse rounded bg-muted" />}>
        <Etiquetas {...props} />
      </Suspense>
    </main>
  );
}

async function Etiquetas({ params, searchParams }: PageProps<"/etiqueta/prenda/[prendaId]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const { prendaId } = await params;
  const sp = await searchParams;
  const prenda = await obtenerPrenda(ctx, prendaId);
  if (!prenda) notFound();

  const variantes = prenda.variantes
    .filter((v) => v.activo)
    .map((v) => {
      const texto = textoParaBarras(v);
      return {
        id: v.id,
        talla: v.talla,
        color: v.color,
        precio: v.precioVenta,
        texto,
        svg: codigoBarrasSvg(texto),
        stock: Math.max(0, Math.floor(Number(v.stock))),
      };
    });

  return <HojaPrenda prendaId={prendaId} nombre={prenda.nombre} variantes={variantes} nueva={sp.nueva === "1"} />;
}
