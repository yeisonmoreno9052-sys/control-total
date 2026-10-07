"use client";

import { useActionState, useState } from "react";
import { Ban, Undo2 } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatearPesos } from "@/lib/formato";
import { Decimal, formatearCantidad, leerCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import { cn } from "@/lib/utils";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { anularAccion, devolucionAccion, type EstadoAccion } from "../acciones";

type LineaVendida = { id: string; nombre: string; unidad: string; cantidad: string; cantidadDevuelta: string; total: number };

export function Correcciones({ ventaId, conDevolucion, lineas }: { ventaId: string; conDevolucion: boolean; lineas: LineaVendida[] }) {
  const [abierto, setAbierto] = useState<"anular" | "devolver" | null>(null);
  const quedaPorDevolver = lineas.some((l) => new Decimal(l.cantidad).gt(l.cantidadDevuelta));
  return (
    <div className="flex flex-wrap gap-2 border-t pt-6">
      {quedaPorDevolver && (
        <Button variant="outline" size="lg" onClick={() => setAbierto("devolver")}>
          <Undo2 /> Registrar devolución
        </Button>
      )}
      {!conDevolucion && (
        <Button variant="outline" size="lg" className="text-destructive" onClick={() => setAbierto("anular")}>
          <Ban /> Anular venta
        </Button>
      )}
      <Dialogo abierto={abierto === "anular"} onCerrar={() => setAbierto(null)} titulo="Anular venta">
        <Anular ventaId={ventaId} onListo={() => setAbierto(null)} />
      </Dialogo>
      <Dialogo
        abierto={abierto === "devolver"}
        onCerrar={() => setAbierto(null)}
        titulo="Registrar devolución"
        className="max-w-lg"
      >
        <Devolver ventaId={ventaId} lineas={lineas} onListo={() => setAbierto(null)} />
      </Dialogo>
    </div>
  );
}

function Anular({ ventaId, onListo }: { ventaId: string; onListo: () => void }) {
  const [estado, accion, anulando] = useActionState<EstadoAccion, FormData>(async (previo, datos) => {
    const r = await anularAccion(previo, datos);
    if (r.ok) onListo();
    return r;
  }, {});
  return (
    <form action={accion} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Todos los productos vuelven al inventario y el dinero sale de la caja de hoy. La venta no se borra: queda marcada como
        anulada, con tu nombre y el motivo.
      </p>
      <input type="hidden" name="ventaId" value={ventaId} />
      <Campo id="motivo" etiqueta="Motivo" error={estado.campos?.motivo}>
        <Textarea id="motivo" name="motivo" required minLength={3} maxLength={300} autoFocus placeholder="Ej.: el cliente se arrepintió" />
      </Campo>
      <AvisoError mensaje={estado.error} />
      <Button type="submit" variant="destructive" size="lg" className="w-full" disabled={anulando}>
        {anulando ? "Anulando…" : "Anular venta"}
      </Button>
    </form>
  );
}

function Devolver({ ventaId, lineas, onListo }: { ventaId: string; lineas: LineaVendida[]; onListo: () => void }) {
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [medio, setMedio] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  // Valor aproximado (el servidor lo calcula exacto con los mismos números).
  const estimado = lineas.reduce((suma, l) => {
    const c = leerCantidad(cantidades[l.id] ?? "");
    if (!c || c.lte(0)) return suma;
    return suma + new Decimal(l.total).times(c).dividedBy(l.cantidad).toDecimalPlaces(0).toNumber();
  }, 0);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await devolucionAccion({
        ventaId,
        motivo,
        medio,
        lineas: Object.entries(cantidades).map(([detalleVentaId, cantidad]) => ({ detalleVentaId, cantidad })),
      });
      if (r.ok) onListo();
      else setError(r.error);
    } catch {
      setError("No pudimos registrar la devolución. Revisa la conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">Escribe cuánto devuelve el cliente de cada producto. El stock vuelve al inventario.</p>
      <ul className="divide-y rounded-lg border">
        {lineas.map((l) => {
          const pendiente = new Decimal(l.cantidad).minus(l.cantidadDevuelta);
          const corto = UNIDADES[l.unidad as UnidadMedida]?.corto;
          return (
            <li key={l.id} className={cn("flex items-center gap-3 p-3", pendiente.lte(0) && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{l.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  Puede devolver {formatearCantidad(pendiente)} {corto}
                </p>
              </div>
              {pendiente.gt(0) && (
                <>
                  <Input
                    value={cantidades[l.id] ?? ""}
                    onChange={(e) => setCantidades((c) => ({ ...c, [l.id]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={`Cantidad a devolver de ${l.nombre}`}
                    className="w-20 text-right tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCantidades((c) => ({ ...c, [l.id]: formatearCantidad(pendiente) }))}
                  >
                    Todo
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <Campo id="motivo-dev" etiqueta="Motivo">
        <Input id="motivo-dev" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ej.: llegó defectuoso" />
      </Campo>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo se devuelve el dinero">
        {(["EFECTIVO", "TRANSFERENCIA"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={medio === m}
            onClick={() => setMedio(m)}
            className={cn(
              "h-11 rounded-lg border text-sm font-medium",
              medio === m ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
            )}
          >
            {m === "EFECTIVO" ? "Devolver en efectivo" : "Devolver por transferencia"}
          </button>
        ))}
      </div>
      <AvisoError mensaje={error} />
      <Button type="submit" size="lg" className="w-full" disabled={enviando || estimado <= 0}>
        {enviando ? "Registrando…" : `Registrar devolución${estimado > 0 ? ` de ${formatearPesos(estimado)}` : ""}`}
      </Button>
    </form>
  );
}
