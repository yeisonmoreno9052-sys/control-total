"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectorPrecio, SelectorTamano, sinPrecioGuardado } from "@/components/etiquetas/selector-tamano";
import type { TamanoEtiqueta } from "@/components/etiquetas/etiqueta";

/** Barra de arriba (no sale en la impresión): volver, cuántas etiquetas e imprimir. */
export function BarraEtiqueta({
  productoId,
  copias,
  nueva,
  imprimir,
  tamano,
  sinPrecio,
}: {
  productoId: string;
  copias: number;
  /** Código de la pieza recién registrada, para mostrar el aviso. */
  nueva: string | null;
  imprimir: boolean;
  tamano: TamanoEtiqueta;
  sinPrecio: boolean;
}) {
  const router = useRouter();

  const cambiar = (n: number, tam: TamanoEtiqueta = tamano, sin: boolean = sinPrecio) => {
    const p = new URLSearchParams({ copias: String(Math.min(100, Math.max(1, n))), tam });
    if (nueva) p.set("nueva", "1");
    if (sin) p.set("precio", "0");
    router.replace(`/etiqueta/${productoId}?${p.toString()}`, { scroll: false });
  };

  // Si en este equipo se escogió "Sin precio", se respeta; si no, se imprime de una vez cuando lo piden.
  const recordarSinPrecio = !sinPrecio && sinPrecioGuardado();
  useEffect(() => {
    if (recordarSinPrecio) {
      const p = new URLSearchParams(window.location.search);
      p.set("precio", "0");
      router.replace(`/etiqueta/${productoId}?${p.toString()}`, { scroll: false });
    } else if (imprimir) window.print();
  }, [recordarSinPrecio, imprimir, productoId, router]);

  return (
    <div className="mx-auto mb-6 max-w-3xl space-y-4 print:hidden">
      {nueva && (
        <p role="status" className="rounded-md bg-accent px-3 py-2 text-accent-foreground">
          Pieza guardada con el código <strong>{nueva}</strong>. Imprime la etiqueta y pégala en la pieza.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href={`/inventario/${productoId}`}>
            <ArrowLeft /> Ver producto
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Etiquetas</span>
          <Button variant="outline" size="icon" aria-label="Una menos" onClick={() => cambiar(copias - 1)} disabled={copias <= 1}>
            <Minus />
          </Button>
          <span className="w-8 text-center text-lg font-semibold tabular-nums">{copias}</span>
          <Button variant="outline" size="icon" aria-label="Una más" onClick={() => cambiar(copias + 1)} disabled={copias >= 100}>
            <Plus />
          </Button>
        </div>
        <Button size="lg" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
      </div>
      <SelectorTamano tamano={tamano} onCambiar={(t) => cambiar(copias, t)} />
      <SelectorPrecio sinPrecio={sinPrecio} onCambiar={(sin) => cambiar(copias, tamano, sin)} />
      {nueva && (
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/inventario/segunda">Registrar otra pieza de segunda</Link>
        </Button>
      )}
    </div>
  );
}
