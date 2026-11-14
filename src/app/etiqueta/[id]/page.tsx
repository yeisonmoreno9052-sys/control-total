import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { obtenerProducto } from "@/lib/datos/productos";
import { codigoBarrasSvg, textoParaBarras } from "@/lib/etiquetas/codigo-barras";
import { Etiqueta, EstiloRollo, leerTamano } from "@/components/etiquetas/etiqueta";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { BarraEtiqueta } from "./barra";

export const metadata: Metadata = { title: "Etiqueta · Control Total" };

// Etiquetas de 60 × 30 mm o 50 × 25 mm para la impresora de rollo: una etiqueta por hoja.
export default function PaginaEtiqueta(props: PageProps<"/etiqueta/[id]">) {
  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-6 print:bg-white print:p-0">
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

  // Las prendas salen por defecto en 50 × 25 mm, el rollo común en almacenes de ropa.
  const tamano = leerTamano(sp.tam, producto.talla ? "50x25" : "60x30");

  const sinPrecio = sp.precio === "0";

  return (
    <>
      <EstiloRollo tamano={tamano} />
      <BarraEtiqueta
        productoId={producto.id}
        copias={copias}
        nueva={sp.nueva === "1" ? producto.codigo : null}
        imprimir={sp.imprimir === "1"}
        tamano={tamano}
        sinPrecio={sinPrecio}
      />
      <div className="rollo-etiquetas mx-auto flex max-w-3xl flex-wrap justify-center gap-[3mm]">
        {Array.from({ length: copias }, (_, i) => (
          <Etiqueta
            key={i}
            nombre={producto.talla ? (producto.prenda ?? producto.nombre) : producto.nombre}
            talla={producto.talla}
            color={producto.color}
            texto={texto}
            svg={svg}
            precio={sinPrecio ? null : producto.precioVenta}
            tamano={tamano}
          />
        ))}
      </div>
    </>
  );
}
