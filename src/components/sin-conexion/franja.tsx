"use client";

import { useState } from "react";
import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { guardarVenta } from "@/lib/sin-conexion/almacen";
import { useConexion } from "./conexion";

const ventasTexto = (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`;

/** Franja arriba de cada pantalla: sin internet, ventas por subir, o ventas que no pudieron subir. */
export function FranjaConexion() {
  const { enLinea, pendientes, subiendo, aviso, subirPendientes } = useConexion();
  const [detalle, setDetalle] = useState(false);
  const conError = pendientes.filter((v) => v.error);

  if (!enLinea) {
    return (
      <div
        role="status"
        className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-6 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      >
        <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1">
          <CloudOff className="size-4 shrink-0" />
          <span className="font-semibold">Sin internet.</span>
          <span>Las ventas se guardan en este computador y se suben solas cuando vuelva la conexión.</span>
          {pendientes.length > 0 && (
            <span className="font-semibold" data-testid="pendientes">
              {ventasTexto(pendientes.length)} {pendientes.length === 1 ? "pendiente" : "pendientes"} por subir.
            </span>
          )}
        </p>
      </div>
    );
  }

  if (conError.length) {
    return (
      <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm md:px-6">
        <div className="mx-auto max-w-6xl space-y-2">
          <p className="flex flex-wrap items-center gap-2">
            <TriangleAlert className="size-4 shrink-0 text-destructive" />
            <span className="font-semibold">{ventasTexto(conError.length)} hechas sin internet no se han podido subir.</span>
            <button type="button" className="underline" onClick={() => setDetalle((d) => !d)}>
              {detalle ? "Ocultar" : "Ver por qué"}
            </button>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={subiendo}
              onClick={async () => {
                for (const v of conError) await guardarVenta({ ...v, reintentar: true });
                await subirPendientes();
              }}
            >
              <RefreshCw className={subiendo ? "animate-spin" : undefined} /> Reintentar
            </Button>
          </p>
          {detalle && (
            <ul className="space-y-1 pl-6">
              {conError.map((v) => (
                <li key={v.idLocal}>
                  <span className="font-medium">{v.numeroProvisional}</span> ·{" "}
                  {new Date(v.creadaEn).toLocaleString("es-CO", { timeZone: "America/Bogota" })} · {v.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (pendientes.length) {
    return (
      <div role="status" className="border-b bg-muted px-4 py-2.5 text-sm md:px-6">
        <p className="mx-auto flex max-w-6xl items-center gap-2">
          <RefreshCw className="size-4 animate-spin" /> Subiendo {ventasTexto(pendientes.length)} hechas sin internet…
        </p>
      </div>
    );
  }

  if (aviso) {
    return (
      <div
        role="status"
        className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 md:px-6 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      >
        <p className="mx-auto flex max-w-6xl items-center gap-2">
          <CheckCircle2 className="size-4" /> {aviso}
        </p>
      </div>
    );
  }
  return null;
}
