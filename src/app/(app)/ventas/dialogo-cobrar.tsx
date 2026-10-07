"use client";

import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Landmark, MessageCircle, Printer, Shuffle } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo, Tecla } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import type { ClienteVista } from "@/lib/datos/clientes";
import { formatearPesos } from "@/lib/formato";
import { formatearConsecutivo } from "@/lib/ventas/recibo";
import { calcularPago, ErrorTotales, type Descuento, type FormaPago } from "@/lib/ventas/totales";
import { cn } from "@/lib/utils";
import { cobrar, enlaceReciboWhatsApp } from "./acciones";
import type { Linea } from "./caja";

type Vendida = { id: string; consecutivo: number; total: number; cambio: number | null };

export function DialogoCobrar(props: {
  abierto: boolean;
  negocioId: string;
  lineas: Linea[];
  descuentoGeneral: Descuento | null;
  cliente: ClienteVista | null;
  total: number;
  onVendida: () => void;
  onPreciosCambiaron: () => void;
  onCerrar: () => void;
}) {
  const [vendida, setVendida] = useState<Vendida | null>(null);
  const cerrar = () => {
    setVendida(null);
    props.onCerrar();
  };
  return (
    <Dialogo abierto={props.abierto} onCerrar={cerrar} titulo={vendida ? undefined : "Cobrar"}>
      {vendida ? (
        <VentaLista vendida={vendida} onNueva={cerrar} />
      ) : (
        <FormularioPago
          {...props}
          onVendida={(v) => {
            setVendida(v);
            props.onVendida();
          }}
        />
      )}
    </Dialogo>
  );
}

const FORMAS = [
  { forma: "efectivo", nombre: "Efectivo", icono: Banknote },
  { forma: "transferencia", nombre: "Transferencia", icono: Landmark },
  { forma: "mixto", nombre: "Mixto", icono: Shuffle },
] as const;

/** Billetes con los que probablemente paga el cliente: los 3 valores redondos más cercanos por encima. */
function sugerencias(total: number) {
  const valores = new Set<number>();
  for (const billete of [2000, 5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / billete) * billete;
    if (v > total) valores.add(v);
  }
  return [...valores].sort((a, b) => a - b).slice(0, 3);
}

function FormularioPago({
  negocioId,
  lineas,
  descuentoGeneral,
  cliente,
  total,
  onVendida,
  onPreciosCambiaron,
}: {
  negocioId: string;
  lineas: Linea[];
  descuentoGeneral: Descuento | null;
  cliente: ClienteVista | null;
  total: number;
  onVendida: (v: Vendida) => void;
  onPreciosCambiaron: () => void;
}) {
  const [forma, setForma] = useState<FormaPago["forma"]>("efectivo");
  const [recibido, setRecibido] = useState<number | null>(null);
  const [transferencia, setTransferencia] = useState<number | null>(null);
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sin escribir nada en "paga con", se entiende que paga exacto: así una venta común es Enter y listo.
  const pago: FormaPago =
    forma === "efectivo"
      ? { forma, recibido: recibido ?? total }
      : forma === "transferencia"
        ? { forma, referencia }
        : { forma, transferencia: transferencia ?? 0, recibido: recibido ?? total - (transferencia ?? 0), referencia };

  let calculado: ReturnType<typeof calcularPago> | null = null;
  let problema: string | null = null;
  try {
    calculado = calcularPago(total, pago);
  } catch (e) {
    if (!(e instanceof ErrorTotales)) throw e;
    problema = e.message;
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (problema) return setError(problema);
    setEnviando(true);
    setError(null);
    try {
      const r = await cobrar({
        negocioId,
        lineas: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad, descuento: l.descuento })),
        descuentoGeneral,
        clienteId: cliente?.id ?? null,
        totalEsperado: total,
        pago,
      });
      if (r.ok) {
        onVendida({ id: r.id, consecutivo: r.consecutivo, total: r.total, cambio: r.cambio });
        return;
      }
      setError(r.error);
      if (r.error.startsWith("Los precios cambiaron")) onPreciosCambiaron();
    } catch {
      setError("No pudimos registrar la venta. Revisa la conexión a internet e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const efectivoAPagar = forma === "mixto" ? Math.max(0, total - (transferencia ?? 0)) : total;

  return (
    <form onSubmit={confirmar} className="space-y-4" noValidate>
      <div>
        <p className="text-sm text-muted-foreground">Total</p>
        <p className="text-4xl font-bold tracking-tight tabular-nums">{formatearPesos(total)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Medio de pago">
        {FORMAS.map(({ forma: f, nombre, icono: Icono }) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={forma === f}
            onClick={() => {
              setForma(f);
              setError(null);
            }}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-medium",
              forma === f ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
            )}
          >
            <Icono className="size-5" />
            {nombre}
          </button>
        ))}
      </div>

      {forma === "mixto" && (
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">Parte por transferencia</span>
          <CampoPesos
            autoFocus
            valor={transferencia}
            onValor={(v) => {
              setTransferencia(v);
              setError(null);
            }}
            className="h-12 text-xl"
          />
        </label>
      )}

      {forma !== "transferencia" && (
        <>
          <label className="block space-y-1.5">
            <span className="text-sm text-muted-foreground">
              El cliente paga con{forma === "mixto" && ` (efectivo a pagar: ${formatearPesos(efectivoAPagar)})`}
            </span>
            <CampoPesos
              autoFocus={forma === "efectivo"}
              valor={recibido}
              onValor={(v) => {
                setRecibido(v);
                setError(null);
              }}
              placeholder={new Intl.NumberFormat("es-CO").format(efectivoAPagar)}
              className="h-14 text-2xl font-semibold"
            />
          </label>
          <div className="grid grid-cols-4 gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => setRecibido(efectivoAPagar)}>
              Exacto
            </Button>
            {sugerencias(efectivoAPagar).map((v) => (
              <Button key={v} type="button" variant="outline" className="h-11 px-1 tabular-nums" onClick={() => setRecibido(v)}>
                {formatearPesos(v)}
              </Button>
            ))}
          </div>
        </>
      )}

      {forma !== "efectivo" && (
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">Referencia de la transferencia (opcional)</span>
          <Input
            autoFocus={forma === "transferencia"}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            maxLength={100}
            placeholder="Ej.: Nequi 4521"
          />
        </label>
      )}

      {forma !== "transferencia" && (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl px-4 py-3",
            problema ? "bg-muted" : "bg-emerald-50 dark:bg-emerald-950/50",
          )}
        >
          <span>Cambio</span>
          <span
            className={cn(
              "text-3xl font-bold tabular-nums",
              problema ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-400",
            )}
            data-testid="cambio"
          >
            {formatearPesos(calculado?.cambio ?? 0)}
          </span>
        </div>
      )}

      <AvisoError mensaje={error ?? (recibido !== null || transferencia !== null ? (problema ?? undefined) : undefined)} />

      <Button type="submit" size="lg" className="h-16 w-full rounded-xl text-xl font-semibold" disabled={enviando}>
        {enviando ? "Registrando…" : "Confirmar venta"} <Tecla>Enter</Tecla>
      </Button>
    </form>
  );
}

function VentaLista({ vendida, onNueva }: { vendida: Vendida; onNueva: () => void }) {
  const [whatsapp, setWhatsapp] = useState<string | null>(null);

  useEffect(() => {
    enlaceReciboWhatsApp(vendida.id).then(setWhatsapp, () => setWhatsapp(null));
  }, [vendida.id]);

  return (
    <div className="space-y-5 text-center">
      <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
      <div>
        <p className="text-lg font-semibold">Venta Nº {formatearConsecutivo(vendida.consecutivo)} registrada</p>
        <p className="text-muted-foreground">Total {formatearPesos(vendida.total)}</p>
      </div>
      {vendida.cambio !== null && (
        <div className="rounded-xl bg-emerald-50 px-4 py-4 dark:bg-emerald-950/50">
          <p className="text-sm">Cambio</p>
          <p className="text-5xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400" data-testid="cambio-final">
            {formatearPesos(vendida.cambio)}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={() => window.open(`/recibo/${vendida.id}?imprimir=1`, "_blank", "noopener")}
        >
          <Printer /> Imprimir
        </Button>
        <Button variant="outline" size="lg" asChild disabled={!whatsapp}>
          <a href={whatsapp ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!whatsapp}>
            <MessageCircle /> WhatsApp
          </a>
        </Button>
      </div>
      <Button size="lg" className="h-14 w-full text-lg" onClick={onNueva} autoFocus>
        Nueva venta <Tecla>Enter</Tecla>
      </Button>
    </div>
  );
}
