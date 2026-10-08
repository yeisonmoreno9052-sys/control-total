"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CloudOff, RefreshCw } from "lucide-react";
import { useConexion } from "@/components/sin-conexion/conexion";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { TecladoNumerico } from "@/components/ventas/teclado-numerico";
import { formatearPesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { cerrarCajaAccion, type EstadoAccion } from "../acciones";

/**
 * Cierre: se cuenta el efectivo y se escribe. El cajero cierra a ciegas (no ve
 * cuánto debería haber); quien gestiona ve lo esperado y la diferencia.
 */
export function CerrarCaja({ cajaId, esperado }: { cajaId: string; esperado: number | null }) {
  const [estado, accion, cerrando] = useActionState<EstadoAccion, FormData>(cerrarCajaAccion, {});
  const [contado, setContado] = useState<number | null>(null);
  const { pendientes, negocioId, enLinea, subiendo, subirPendientes } = useConexion();
  const sinSubir = pendientes.filter((v) => v.negocioId === negocioId).length;

  // Las ventas hechas sin internet en este computador tienen que estar en el sistema antes
  // de contar: si no, el efectivo no cuadraría.
  useEffect(() => {
    subirPendientes();
  }, [subirPendientes]);

  if (estado.ok) {
    const diferencia = estado.mensaje === undefined ? null : Number(estado.mensaje);
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <p className="text-xl font-semibold">Caja cerrada</p>
        {diferencia !== null ? (
          <Diferencia valor={diferencia} />
        ) : (
          <p className="text-muted-foreground">Quedó registrado lo que contaste. El administrador revisa el cuadre.</p>
        )}
        <Button asChild size="lg">
          <Link href="/ventas">Listo</Link>
        </Button>
      </div>
    );
  }

  if (sinSubir && !estado.ok) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-6 text-center">
        <CloudOff className="mx-auto size-12 text-amber-600" />
        <p className="text-xl font-semibold">
          {sinSubir === 1 ? "Hay 1 venta hecha sin internet" : `Hay ${sinSubir} ventas hechas sin internet`} que aún no sube
          {sinSubir === 1 ? "" : "n"}
        </p>
        <p className="text-muted-foreground">
          {enLinea
            ? "Hay que subirlas antes de cerrar la caja, para que el efectivo cuadre. Si alguna tiene un problema, aparece en la franja roja de arriba."
            : "Cuando vuelva el internet se suben solas y podrás cerrar la caja."}
        </p>
        <Button size="lg" disabled={!enLinea || subiendo} onClick={() => subirPendientes()}>
          <RefreshCw className={subiendo ? "animate-spin" : undefined} /> {subiendo ? "Subiendo…" : "Subirlas ahora"}
        </Button>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-4 rounded-2xl border bg-card p-6">
      <input type="hidden" name="cajaId" value={cajaId} />
      <input type="hidden" name="contado" value={contado ?? ""} />
      <Campo
        id="contado"
        etiqueta="Efectivo contado en la caja"
        error={estado.campos?.contado}
        ayuda="Cuenta billetes y monedas, incluida la base."
      >
        <CampoPesos id="contado" autoFocus valor={contado} onValor={setContado} className="h-14 text-2xl font-semibold" />
      </Campo>
      <TecladoNumerico />
      {esperado !== null && contado !== null && <Diferencia valor={contado - esperado} />}
      <Campo id="nota" etiqueta="Nota (opcional)">
        <Textarea id="nota" name="nota" maxLength={300} placeholder="Ej.: faltan $ 2.000 de un cambio mal dado" />
      </Campo>
      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" className="h-14 w-full text-lg" disabled={cerrando || contado === null}>
        {cerrando ? "Cerrando…" : "Cerrar caja"}
      </Button>
    </form>
  );
}

export function Diferencia({ valor }: { valor: number }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl px-4 py-3",
        valor === 0
          ? "bg-emerald-50 dark:bg-emerald-950/50"
          : valor > 0
            ? "bg-amber-50 dark:bg-amber-950/50"
            : "bg-destructive/10",
      )}
    >
      <span>{valor === 0 ? "Cuadra exacto" : valor > 0 ? "Sobra" : "Falta"}</span>
      <span
        className={cn(
          "text-2xl font-bold tabular-nums",
          valor === 0
            ? "text-emerald-700 dark:text-emerald-400"
            : valor > 0
              ? "text-amber-700 dark:text-amber-400"
              : "text-destructive",
        )}
      >
        {formatearPesos(Math.abs(valor))}
      </span>
    </div>
  );
}
