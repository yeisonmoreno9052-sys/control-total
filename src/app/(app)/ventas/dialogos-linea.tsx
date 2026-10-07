"use client";

import { useState } from "react";
import { AvisoError } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import type { ProductoCaja } from "@/lib/datos/productos";
import { Decimal, formatearCantidad, leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import type { Descuento } from "@/lib/ventas/totales";
import { cn } from "@/lib/utils";
import type { UnidadMedida } from "@/generated/prisma/enums";

/** Cantidad de un producto: la piden los fraccionados al entrar (2,5 m) y cualquiera al tocar el número. */
export function DialogoCantidad({
  abierto,
  producto,
  actual,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  producto: ProductoCaja | null;
  actual: string | null;
  onConfirmar: (cantidad: Decimal) => string | null;
  onCerrar: () => void;
}) {
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={producto?.nombre ?? "Cantidad"}>
      {producto && <FormularioCantidad producto={producto} actual={actual} onConfirmar={onConfirmar} />}
    </Dialogo>
  );
}

function FormularioCantidad({
  producto,
  actual,
  onConfirmar,
}: {
  producto: ProductoCaja;
  actual: string | null;
  onConfirmar: (cantidad: Decimal) => string | null;
}) {
  const unidad = UNIDADES[producto.unidad as UnidadMedida];
  const [texto, setTexto] = useState(actual ? formatearCantidad(actual) : "");
  const [error, setError] = useState<string | null>(null);

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const cantidad = leerCantidad(texto);
    const problema = validarCantidad(cantidad, { fraccionado: producto.fraccionado });
    if (problema) return setError(MENSAJES_CANTIDAD[problema]);
    if (cantidad!.lte(0)) return setError("La cantidad debe ser mayor que cero.");
    setError(onConfirmar(cantidad!));
  }

  return (
    <form onSubmit={confirmar} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Quedan {formatearCantidad(producto.stock)} {unidad?.corto}.
        {producto.fraccionado && " Puedes escribir decimales, por ejemplo 2,5 o 0,350."}
      </p>
      <div className="relative">
        <Input
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          inputMode={producto.fraccionado ? "decimal" : "numeric"}
          aria-label={`Cantidad en ${unidad?.nombre.toLowerCase()}`}
          aria-invalid={!!error}
          className="h-16 pr-16 text-3xl font-semibold tabular-nums"
        />
        <span className="absolute top-1/2 right-4 -translate-y-1/2 text-lg text-muted-foreground">{unidad?.corto}</span>
      </div>
      <AvisoError mensaje={error ?? undefined} />
      <Button type="submit" size="lg" className="h-14 w-full text-lg">
        Listo
      </Button>
    </form>
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
              inputMode="decimal"
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
