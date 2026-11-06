"use client";

import { useState } from "react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { TecladoNumerico, useCampoTeclado } from "@/components/ventas/teclado-numerico";
import type { ProductoCaja } from "@/lib/datos/productos";
import { Decimal, formatearCantidad, leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import type { Presentacion } from "@/lib/inventario/presentaciones";
import { formatearPesos } from "@/lib/formato";
import type { Descuento } from "@/lib/ventas/totales";
import { cn } from "@/lib/utils";
import type { UnidadMedida } from "@/generated/prisma/enums";

/** Cantidad de un producto: la piden los fraccionados al entrar (2,5 m) y cualquiera al tocar el número. */
export function DialogoCantidad({
  abierto,
  producto,
  presentacion,
  actual,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  producto: ProductoCaja | null;
  /** Si la línea es por paquete (tubo completo), la cantidad es de paquetes. */
  presentacion?: Presentacion | null;
  actual: string | null;
  onConfirmar: (cantidad: Decimal) => string | null;
  onCerrar: () => void;
}) {
  const titulo = producto ? (presentacion ? `${producto.nombre} · ${presentacion.nombre}` : producto.nombre) : "Cantidad";
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      {producto && (
        <FormularioCantidad producto={producto} presentacion={presentacion ?? null} actual={actual} onConfirmar={onConfirmar} />
      )}
    </Dialogo>
  );
}

function FormularioCantidad({
  producto,
  presentacion,
  actual,
  onConfirmar,
}: {
  producto: ProductoCaja;
  presentacion: Presentacion | null;
  actual: string | null;
  onConfirmar: (cantidad: Decimal) => string | null;
}) {
  const unidad = UNIDADES[producto.unidad as UnidadMedida];
  // Los paquetes se venden completos: 2 tubos, no 1,5.
  const fraccionado = !presentacion && producto.fraccionado;
  const [texto, setTexto] = useState(actual ? formatearCantidad(actual) : "");
  const [error, setError] = useState<string | null>(null);
  const teclado = useCampoTeclado(fraccionado ? "decimal" : "numeric");

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const cantidad = leerCantidad(texto);
    const problema = validarCantidad(cantidad, { fraccionado });
    if (problema) return setError(presentacion && problema === "entera" ? "Escribe cuántos completos, sin decimales." : MENSAJES_CANTIDAD[problema]);
    if (cantidad!.lte(0)) return setError("La cantidad debe ser mayor que cero.");
    setError(onConfirmar(cantidad!));
  }

  return (
    <form onSubmit={confirmar} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        {presentacion && `Cada uno trae ${formatearCantidad(presentacion.cantidad)} ${unidad?.corto ?? ""}. `}
        {producto.controlaStock !== false && `Quedan ${formatearCantidad(producto.stock)} ${unidad?.corto ?? ""}.`}
        {fraccionado && " Puedes escribir decimales, por ejemplo 2,5 o 0,350."}
      </p>
      <div className="relative">
        <Input
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          {...teclado}
          aria-label={presentacion ? `Cuántos: ${presentacion.nombre}` : `Cantidad en ${unidad?.nombre.toLowerCase()}`}
          aria-invalid={!!error}
          className="h-16 pr-16 text-3xl font-semibold tabular-nums"
        />
        {!presentacion && (
          <span className="absolute top-1/2 right-4 -translate-y-1/2 text-lg text-muted-foreground">{unidad?.corto}</span>
        )}
      </div>
      <TecladoNumerico decimales={fraccionado} />
      <AvisoError mensaje={error ?? undefined} />
      <Button type="submit" size="lg" className="h-14 w-full text-lg">
        Listo
      </Button>
    </form>
  );
}

/**
 * Producto que también se vende por paquete (tubo completo, caja de tornillos): la cajera
 * elige cómo lo lleva el cliente. Con el teclado: 1 para la unidad, 2, 3… para los paquetes.
 */
export function DialogoPresentacion({
  abierto,
  producto,
  onElegir,
  onCerrar,
}: {
  abierto: boolean;
  producto: ProductoCaja | null;
  /** null = por la unidad del producto (por metro). */
  onElegir: (presentacion: Presentacion | null) => void;
  onCerrar: () => void;
}) {
  const unidad = producto ? UNIDADES[producto.unidad as UnidadMedida] : null;
  const opciones = producto
    ? [
        {
          presentacion: null,
          titulo: `Por ${unidad?.nombre.toLowerCase() ?? "unidad"}`,
          detalle: `${formatearPesos(producto.precioVenta)} ${producto.unidad === "UNIDAD" ? "cada una" : `el ${unidad?.corto ?? ""}`}`,
        },
        ...(producto.presentaciones ?? []).map((p) => ({
          presentacion: p,
          titulo: p.nombre,
          detalle: `${formatearCantidad(p.cantidad)} ${unidad?.corto ?? ""} · ${formatearPesos(p.precio)}`,
        })),
      ]
    : [];
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={producto?.nombre ?? "¿Cómo lo lleva?"}>
      {producto && (
        <div
          className="space-y-3"
          onKeyDown={(e) => {
            const n = Number(e.key);
            if (Number.isInteger(n) && n >= 1 && n <= opciones.length) {
              e.preventDefault();
              onElegir(opciones[n - 1].presentacion);
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            ¿Cómo lo lleva el cliente?
            {producto.controlaStock !== false && ` Quedan ${formatearCantidad(producto.stock)} ${unidad?.corto ?? ""}.`}
          </p>
          <div className="grid gap-3">
            {opciones.map((o, i) => (
              <button
                key={o.presentacion?.id ?? "unidad"}
                type="button"
                data-autofocus={i === 0 ? true : undefined}
                onClick={() => onElegir(o.presentacion)}
                className="flex min-h-16 items-center gap-3 rounded-xl border-2 bg-card px-4 py-3 text-left transition hover:border-primary focus-visible:border-primary focus-visible:outline-none active:scale-[0.99] active:bg-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold leading-tight">{o.titulo}</span>
                  <span className="block text-muted-foreground tabular-nums">{o.detalle}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Dialogo>
  );
}

/** Descuento de una línea o de toda la venta, en pesos o en porcentaje. */
export function DialogoDescuento({
  abierto,
  titulo,
  actual,
  probar,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  actual: Descuento | null;
  probar: (d: Descuento | null) => string | null;
  onConfirmar: (d: Descuento | null) => void;
  onCerrar: () => void;
}) {
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <FormularioDescuento actual={actual} probar={probar} onConfirmar={onConfirmar} />
    </Dialogo>
  );
}

const PORCENTAJES = [5, 10, 15, 20];

function FormularioDescuento({
  actual,
  probar,
  onConfirmar,
}: {
  actual: Descuento | null;
  probar: (d: Descuento | null) => string | null;
  onConfirmar: (d: Descuento | null) => void;
}) {
  const [tipo, setTipo] = useState<Descuento["tipo"]>(actual?.tipo ?? "porcentaje");
  const [pesos, setPesos] = useState<number | null>(actual?.tipo === "pesos" ? actual.valor : null);
  const [porcentaje, setPorcentaje] = useState(actual?.tipo === "porcentaje" ? formatearCantidad(actual.valor) : "");
  const [error, setError] = useState<string | null>(null);
  const teclado = useCampoTeclado("decimal");

  function aplicar(d: Descuento | null) {
    const problema = probar(d);
    if (problema) return setError(problema);
    onConfirmar(d);
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (tipo === "pesos") return aplicar(pesos ? { tipo, valor: pesos } : null);
    const valor = leerCantidad(porcentaje);
    if (porcentaje.trim() && (!valor || valor.isNegative() || valor.decimalPlaces() > 2)) {
      return setError("Escribe un porcentaje válido, por ejemplo 10.");
    }
    aplicar(valor && !valor.isZero() ? { tipo, valor: valor.toNumber() } : null);
  }

  return (
    <form onSubmit={confirmar} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de descuento">
        {(["porcentaje", "pesos"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => {
              setTipo(t);
              setError(null);
            }}
            className={cn(
              "h-12 rounded-lg border font-medium",
              tipo === t ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
            )}
          >
            {t === "porcentaje" ? "Porcentaje (%)" : "Pesos ($)"}
          </button>
        ))}
      </div>

      {tipo === "porcentaje" ? (
        <>
          <div className="relative">
            <Input
              autoFocus
              value={porcentaje}
              onChange={(e) => {
                setPorcentaje(e.target.value);
                setError(null);
              }}
              {...teclado}
              aria-label="Porcentaje de descuento"
              className="h-14 pr-10 text-2xl font-semibold tabular-nums"
            />
            <span className="absolute top-1/2 right-4 -translate-y-1/2 text-lg text-muted-foreground">%</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {PORCENTAJES.map((p) => (
              <Button key={p} type="button" variant="outline" onClick={() => setPorcentaje(String(p))}>
                {p} %
              </Button>
            ))}
          </div>
        </>
      ) : (
        <CampoPesos
          autoFocus
          valor={pesos}
          onValor={(v) => {
            setPesos(v);
            setError(null);
          }}
          aria-label="Descuento en pesos"
          className="h-14 text-2xl font-semibold"
        />
      )}
      <TecladoNumerico decimales={tipo === "porcentaje"} />

      <AvisoError mensaje={error ?? undefined} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="lg" onClick={() => aplicar(null)} disabled={!actual}>
          Quitar descuento
        </Button>
        <Button type="submit" size="lg">
          Aplicar
        </Button>
      </div>
    </form>
  );
}

export function DialogoCancelar({
  abierto,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="¿Cancelar esta venta?">
      <p className="mb-5 text-muted-foreground">Se vacía el carrito. No se guarda nada ni se mueve el inventario.</p>
      <div className="grid grid-cols-2 gap-2">
        {/* El foco queda en "Seguir": un Enter del lector de códigos no borra la venta por accidente. */}
        <Button variant="outline" size="lg" onClick={onCerrar} data-autofocus>
          Seguir vendiendo
        </Button>
        <Button variant="destructive" size="lg" onClick={onConfirmar}>
          Sí, cancelar
        </Button>
      </div>
    </Dialogo>
  );
}
