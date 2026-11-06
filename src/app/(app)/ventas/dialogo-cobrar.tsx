"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CheckCircle2, CloudOff, HandCoins, Landmark, MessageCircle, Printer, Shuffle, UserRound } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { esErrorDeRed, useConexion } from "@/components/sin-conexion/conexion";
import { Button } from "@/components/ui/button";
import { Dialogo, Tecla } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { TecladoNumerico, useTecladoActivo } from "@/components/ventas/teclado-numerico";
import type { ClienteVista } from "@/lib/datos/clientes";
import { formatearPesos } from "@/lib/formato";
import { Decimal } from "@/lib/inventario/cantidades";
import { unidadesDe } from "@/lib/inventario/presentaciones";
import { descontarStock, siguienteProvisional, type VentaPendiente } from "@/lib/sin-conexion/almacen";
import { htmlRecibo, imprimirHtml } from "@/lib/sin-conexion/recibo";
import { formatearConsecutivo } from "@/lib/ventas/recibo";
import { calcularPago, ErrorTotales, type Descuento, type FormaPago } from "@/lib/ventas/totales";
import { cn } from "@/lib/utils";
import { cobrar, enlaceReciboWhatsApp, saldoClienteCaja } from "./acciones";
import { precioLinea, totalesDe, type Linea } from "./caja";

type Vendida =
  | { local: false; id: string; consecutivo: number; total: number; cambio: number | null }
  | { local: true; venta: VentaPendiente };

export function DialogoCobrar(props: {
  abierto: boolean;
  negocioId: string;
  lineas: Linea[];
  descuentoGeneral: Descuento | null;
  cliente: ClienteVista | null;
  total: number;
  /** El negocio deja fiar: aparece la opción "Fiado". */
  permiteCredito?: boolean;
  /** Arranca con "Fiado" elegido (al volver de escoger el cliente). */
  formaInicial?: FormaPago["forma"];
  /** Abre la ventana para escoger o crear el cliente al que se le fía. */
  onElegirCliente?: () => void;
  onVendida: () => void;
  onPreciosCambiaron: () => void;
  onCerrar: () => void;
}) {
  const [vendida, setVendida] = useState<Vendida | null>(null);
  // Con teclado en pantalla, la ventana se ensancha: el teclado va al lado y "Confirmar" queda a la vista.
  const conTeclado = useTecladoActivo() && !vendida;
  const cerrar = () => {
    setVendida(null);
    props.onCerrar();
  };
  return (
    <Dialogo
      abierto={props.abierto}
      onCerrar={cerrar}
      titulo={vendida ? undefined : "Cobrar"}
      className={conTeclado ? "md:max-w-3xl" : undefined}
    >
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
  { forma: "credito", nombre: "Fiado", icono: HandCoins },
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
  permiteCredito = false,
  formaInicial,
  onElegirCliente,
  onVendida,
  onPreciosCambiaron,
}: {
  negocioId: string;
  lineas: Linea[];
  descuentoGeneral: Descuento | null;
  cliente: ClienteVista | null;
  total: number;
  permiteCredito?: boolean;
  formaInicial?: FormaPago["forma"];
  onElegirCliente?: () => void;
  onVendida: (v: Vendida) => void;
  onPreciosCambiaron: () => void;
}) {
  const [forma, setForma] = useState<FormaPago["forma"]>(permiteCredito ? (formaInicial ?? "efectivo") : "efectivo");
  const conTeclado = useTecladoActivo();
  const [recibido, setRecibido] = useState<number | null>(null);
  const [transferencia, setTransferencia] = useState<number | null>(null);
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enLinea, usuario, marcarSinConexion, guardarVentaLocal } = useConexion();
  // Sin internet no se fía: no se puede revisar ni guardar la deuda del cliente.
  const formas = FORMAS.filter((f) => f.forma !== "credito" || (permiteCredito && enLinea));
  const fiado = forma === "credito";
  const [debeAntes, setDebeAntes] = useState<{ clienteId: string; debe: number } | null>(null);
  useEffect(() => {
    if (!fiado || !cliente) return;
    let vigente = true;
    saldoClienteCaja(cliente.id).then(
      (debe) => vigente && setDebeAntes({ clienteId: cliente.id, debe }),
      () => undefined,
    );
    return () => {
      vigente = false;
    };
  }, [fiado, cliente]);
  const debe = cliente && debeAntes?.clienteId === cliente.id ? debeAntes.debe : null;

  // Código único de esta venta: si se reintenta (o se guarda sin internet después de un
  // corte a mitad del cobro), el servidor la reconoce y no la registra dos veces.
  // Cambia solo si cambia el carrito.
  const firma = JSON.stringify([
    lineas.map((l) => [l.producto.id, l.presentacion?.id, l.cantidad, l.descuento]),
    descuentoGeneral,
    cliente?.id,
    total,
  ]);
  const codigo = useRef<{ firma: string; idLocal: string } | null>(null);
  const idLocalActual = () => {
    if (codigo.current?.firma !== firma) codigo.current = { firma, idLocal: crypto.randomUUID() };
    return codigo.current.idLocal;
  };

  // Sin escribir nada en "paga con", se entiende que paga exacto: así una venta común es Enter y listo.
  const pago: FormaPago =
    forma === "efectivo"
      ? { forma, recibido: recibido ?? total }
      : forma === "transferencia"
        ? { forma, referencia }
        : forma === "credito"
          ? { forma }
          : { forma, transferencia: transferencia ?? 0, recibido: recibido ?? total - (transferencia ?? 0), referencia };

  let calculado: ReturnType<typeof calcularPago> | null = null;
  let problema: string | null = null;
  try {
    calculado = calcularPago(total, pago);
  } catch (e) {
    if (!(e instanceof ErrorTotales)) throw e;
    problema = e.message;
  }
  if (fiado && !cliente) problema = "Para fiar, elige a quién le fías.";

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (fiado && !cliente) return onElegirCliente?.();
    if (problema) return setError(problema);
    setEnviando(true);
    setError(null);
    const idLocal = idLocalActual();
    if (!enLinea) {
      if (fiado) {
        setEnviando(false);
        return setError("Sin internet no se puede fiar. Cobra en efectivo o transferencia.");
      }
      await guardarSinInternet(idLocal);
      setEnviando(false);
      return;
    }
    try {
      const r = await cobrar({
        idLocal,
        negocioId,
        lineas: lineas.map((l) => ({
          productoId: l.producto.id,
          presentacionId: l.presentacion?.id ?? null,
          cantidad: l.cantidad,
          descuento: l.descuento,
        })),
        descuentoGeneral,
        clienteId: cliente?.id ?? null,
        totalEsperado: total,
        pago,
      });
      if (r.ok) {
        onVendida({ local: false, id: r.id, consecutivo: r.consecutivo, total: r.total, cambio: r.cambio });
        return;
      }
      setError(r.error);
      if (r.error.startsWith("Los precios cambiaron")) onPreciosCambiaron();
    } catch (e) {
      if (esErrorDeRed(e)) {
        marcarSinConexion();
        if (fiado) setError("Se fue el internet. Sin internet no se puede fiar: cobra en efectivo o transferencia.");
        else await guardarSinInternet(idLocal);
      } else {
        setError("No pudimos registrar la venta. Intenta de nuevo.");
      }
    } finally {
      setEnviando(false);
    }
  }

  /** Guarda la venta en este computador; se sube sola cuando vuelva el internet. */
  async function guardarSinInternet(idLocal: string) {
    const t = totalesDe(lineas, descuentoGeneral);
    if (!t || typeof t === "string" || !calculado) return setError(typeof t === "string" ? t : problema);
    try {
      const venta: VentaPendiente = {
        negocioId,
        idLocal,
        numeroProvisional: await siguienteProvisional(negocioId),
        creadaEn: new Date().toISOString(),
        vendedorId: usuario.id,
        lineas: lineas.map((l) => ({
          productoId: l.producto.id,
          presentacion: l.presentacion
            ? { id: l.presentacion.id, nombre: l.presentacion.nombre, cantidad: l.presentacion.cantidad }
            : null,
          cantidad: l.cantidad,
          precioUnitario: precioLinea(l),
          porcentajeIva: l.producto.porcentajeIva,
          descuento: l.descuento,
        })),
        descuentoGeneral,
        clienteId: cliente?.id ?? null,
        total,
        pago,
        recibo: {
          vendedor: usuario.nombre,
          cliente: cliente?.nombre ?? null,
          lineas: lineas.map((l, i) => ({
            nombre: l.producto.nombre,
            unidad: l.producto.unidad,
            cantidad: l.cantidad,
            presentacion: l.presentacion
              ? { nombre: l.presentacion.nombre, cantidad: l.presentacion.cantidad }
              : null,
            precioUnitario: precioLinea(l),
            porcentajeIva: l.producto.porcentajeIva,
            subtotal: t.lineas[i].subtotal,
            descuento: t.lineas[i].descuento,
            base: t.lineas[i].base,
            iva: t.lineas[i].iva,
          })),
          subtotal: t.subtotal,
          descuento: t.descuento,
          total: t.total,
          pagos: calculado.pagos.filter((p): p is typeof p & { medio: "EFECTIVO" | "TRANSFERENCIA" } => p.medio !== "CREDITO"),
          recibido: calculado.recibido,
          cambio: calculado.cambio,
        },
        error: null,
        reintentar: true,
      };
      const cantidades = new Map<string, string>();
      for (const l of lineas)
        cantidades.set(
          l.producto.id,
          new Decimal(cantidades.get(l.producto.id) ?? 0).plus(unidadesDe(l.cantidad, l.presentacion)).toString(),
        );
      await descontarStock(negocioId, cantidades, (stock, cantidad) => new Decimal(stock).minus(cantidad).toString());
      await guardarVentaLocal(venta);
      onVendida({ local: true, venta });
    } catch {
      setError("No se pudo guardar la venta en este computador. Revisa que el navegador no esté en modo privado.");
    }
  }

  const efectivoAPagar = forma === "mixto" ? Math.max(0, total - (transferencia ?? 0)) : total;

  return (
    <form
      onSubmit={confirmar}
      className={cn(conTeclado ? "gap-6 md:grid md:grid-cols-[1fr_17rem] md:items-start" : undefined)}
      noValidate
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-4xl font-bold tracking-tight tabular-nums">{formatearPesos(total)}</p>
        </div>

        <div
          className={cn("grid gap-2", formas.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}
          role="radiogroup"
          aria-label="Medio de pago"
        >
          {formas.map(({ forma: f, nombre, icono: Icono }) => (
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

        {fiado && (
          <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            {cliente ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Le fías a</p>
                    <p className="truncate text-xl font-semibold">{cliente.nombre}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={onElegirCliente}>
                    Cambiar
                  </Button>
                </div>
                <div className="space-y-1 text-base tabular-nums">
                  <div className="flex justify-between">
                    <span>Ya debía</span>
                    <span>{debe === null ? "…" : formatearPesos(Math.max(debe, 0))}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Va a quedar debiendo</span>
                    <span data-testid="queda-debiendo">{debe === null ? "…" : formatearPesos(Math.max(debe, 0) + total)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-base">Para fiar hay que anotar a quién. Búscalo o créalo con su nombre y celular.</p>
                <Button type="button" size="lg" className="h-14 w-full text-lg" onClick={onElegirCliente}>
                  <UserRound /> ¿A quién le fías?
                </Button>
              </>
            )}
          </div>
        )}

        {(forma === "efectivo" || forma === "mixto") && (
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

        {(forma === "transferencia" || forma === "mixto") && (
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

        {(forma === "efectivo" || forma === "mixto") && (
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
          {enviando ? "Registrando…" : fiado ? (cliente ? "Confirmar fiado" : "Elegir a quién le fías") : "Confirmar venta"}{" "}
          <Tecla>Enter</Tecla>
        </Button>
      </div>
      {conTeclado && <TecladoNumerico className="mt-4 md:mt-0" />}
    </form>
  );
}

function VentaLista({ vendida, onNueva }: { vendida: Vendida; onNueva: () => void }) {
  if (vendida.local) return <VentaGuardadaLocal venta={vendida.venta} onNueva={onNueva} />;
  return <VentaRegistrada vendida={vendida} onNueva={onNueva} />;
}

function VentaGuardadaLocal({ venta, onNueva }: { venta: VentaPendiente; onNueva: () => void }) {
  const { datosRecibo } = useConexion();
  return (
    <div className="space-y-5 text-center">
      <CloudOff className="mx-auto size-14 text-amber-600" />
      <div>
        <p className="text-lg font-semibold">Venta guardada sin internet</p>
        <p className="text-muted-foreground">
          Nº provisional {venta.numeroProvisional} · Total {formatearPesos(venta.total)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Se sube sola cuando vuelva la conexión.</p>
      </div>
      {venta.recibo.cambio !== null && (
        <div className="rounded-xl bg-emerald-50 px-4 py-4 dark:bg-emerald-950/50">
          <p className="text-sm">Cambio</p>
          <p className="text-5xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400" data-testid="cambio-final">
            {formatearPesos(venta.recibo.cambio)}
          </p>
        </div>
      )}
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={async () => imprimirHtml(htmlRecibo(venta.numeroProvisional, venta.creadaEn, venta.recibo, await datosRecibo()))}
      >
        <Printer /> Imprimir recibo
      </Button>
      <Button size="lg" className="h-14 w-full text-lg" onClick={onNueva} autoFocus>
        Nueva venta <Tecla>Enter</Tecla>
      </Button>
    </div>
  );
}

function VentaRegistrada({ vendida, onNueva }: { vendida: Extract<Vendida, { local: false }>; onNueva: () => void }) {
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
        <Button variant="outline" size="lg" onClick={() => window.open(`/recibo/${vendida.id}?imprimir=1`, "_blank", "noopener")}>
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
