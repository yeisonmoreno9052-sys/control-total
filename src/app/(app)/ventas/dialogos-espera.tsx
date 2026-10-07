"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import type { ClienteVista } from "@/lib/datos/clientes";
import { formatearHora, formatearPesos } from "@/lib/formato";
import type { Descuento } from "@/lib/ventas/totales";
import { totalesDe, type Linea } from "./caja";

/** Una venta que se dejó a un lado (el cliente fue por la plata) para atender a otro. No mueve stock ni caja. */
export type VentaEnEspera = {
  id: string;
  nombre: string;
  creada: string;
  lineas: Linea[];
  descuentoGeneral: Descuento | null;
  cliente: ClienteVista | null;
};

export function leerEnEspera(clave: string): VentaEnEspera[] {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as VentaEnEspera[]) : [];
  } catch {
    return [];
  }
}

export function guardarEnEspera(clave: string, ventas: VentaEnEspera[]) {
  try {
    if (ventas.length) localStorage.setItem(clave, JSON.stringify(ventas));
    else localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento: las ventas en espera viven solo en la pantalla.
  }
}

const totalDe = (v: VentaEnEspera) => {
  const t = totalesDe(v.lineas, v.descuentoGeneral);
  return t && typeof t === "object" ? t.total : null;
};

/** Pide un nombre corto para reconocer la venta al volver (opcional). */
export function DialogoDejarEnEspera({
  abierto,
  sugerido,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  sugerido: string;
  onConfirmar: (nombre: string) => void;
  onCerrar: () => void;
}) {
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="Dejar venta en espera">
      {abierto && <FormularioEspera sugerido={sugerido} onConfirmar={onConfirmar} />}
    </Dialogo>
  );
}

function FormularioEspera({ sugerido, onConfirmar }: { sugerido: string; onConfirmar: (nombre: string) => void }) {
  const [nombre, setNombre] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar(nombre.trim() || sugerido);
      }}
    >
      <p className="text-muted-foreground">La caja queda libre para atender a otro cliente. Esta venta no se cobra todavía.</p>
      <label className="block space-y-1.5">
        <span className="text-sm text-muted-foreground">Nombre para reconocerla (opcional)</span>
        <Input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={40}
          placeholder={`Ej.: Señor de la moto roja (si no, "${sugerido}")`}
          className="h-12 text-lg"
        />
      </label>
      <Button type="submit" size="lg" className="h-14 w-full text-lg">
        Dejar en espera
      </Button>
    </form>
  );
}

/** Lista de ventas en espera: retomar una o descartarla. */
export function DialogoEnEspera({
  abierto,
  ventas,
  hayCarrito,
  onRetomar,
  onDescartar,
  onCerrar,
}: {
  abierto: boolean;
  ventas: VentaEnEspera[];
  hayCarrito: boolean;
  onRetomar: (v: VentaEnEspera) => void;
  onDescartar: (v: VentaEnEspera) => void;
  onCerrar: () => void;
}) {
  const [porDescartar, setPorDescartar] = useState<string | null>(null);
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="Ventas en espera">
      {ventas.length === 0 ? (
        <p className="text-muted-foreground">No hay ventas en espera.</p>
      ) : (
        <div className="space-y-3">
          {hayCarrito && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              La venta que tienes ahora en la caja también queda en espera al retomar otra.
            </p>
          )}
          <ul className="divide-y rounded-xl border">
            {ventas.map((v) => {
              const total = totalDe(v);
              return (
                <li key={v.id} className="flex items-center gap-2 p-2">
                  <button
                    type="button"
                    onClick={() => onRetomar(v)}
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left hover:bg-accent"
                  >
                    <p className="truncate font-semibold">{v.nombre}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {formatearHora(new Date(v.creada))} · {v.lineas.length} {v.lineas.length === 1 ? "producto" : "productos"}
                      {total !== null && ` · ${formatearPesos(total)}`}
                    </p>
                  </button>
                  {porDescartar === v.id ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        onDescartar(v);
                        setPorDescartar(null);
                      }}
                    >
                      Sí, descartar
                    </Button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPorDescartar(v.id)}
                      aria-label={`Descartar ${v.nombre}`}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Trash2 className="size-5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted-foreground">Toca una venta para seguir con ella.</p>
        </div>
      )}
    </Dialogo>
  );
}
