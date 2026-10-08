"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Barra de arriba (no sale en la impresión): volver, cuántas etiquetas e imprimir. */
export function BarraEtiqueta({
  productoId,
  copias,
  nueva,
  imprimir,
}: {
  productoId: string;
  copias: number;
  /** Código de la pieza recién registrada, para mostrar el aviso. */
  nueva: string | null;
  imprimir: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (imprimir) window.print();
  }, [imprimir]);

  const cambiar = (n: number) => {
    const p = new URLSearchParams({ copias: String(Math.min(100, Math.max(1, n))) });
    if (nueva) p.set("nueva", "1");
    router.replace(`/etiqueta/${productoId}?${p.toString()}`, { scroll: false });
  };

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
      {nueva && (
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/inventario/segunda">Registrar otra pieza de segunda</Link>
        </Button>
      )}
    </div>
  );
}
