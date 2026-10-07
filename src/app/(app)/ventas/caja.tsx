"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Percent, Plus, ScanBarcode, Search, ShoppingCart, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tecla } from "@/components/ui/dialogo";
import type { ClienteVista } from "@/lib/datos/clientes";
import type { ProductoCaja } from "@/lib/datos/productos";
import { formatearPesos } from "@/lib/formato";
import { Decimal, formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import { calcularTotales, ErrorTotales, type Descuento, type TotalesVenta } from "@/lib/ventas/totales";
import { cn } from "@/lib/utils";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { buscarProductoCaja, refrescarCarrito } from "./acciones";
import { DialogoCliente } from "./dialogo-cliente";
import { DialogoCobrar } from "./dialogo-cobrar";
import { DialogoCancelar, DialogoCantidad, DialogoDescuento } from "./dialogos-linea";

export type Linea = { producto: ProductoCaja; cantidad: string; descuento: Descuento | null };
type Guardado = { lineas: Linea[]; descuentoGeneral: Descuento | null; cliente: ClienteVista | null };

const unidadCorta = (u: string) => UNIDADES[u as UnidadMedida]?.corto ?? "";

export function textoDescuento(d: Descuento) {
  return d.tipo === "porcentaje" ? `${formatearCantidad(d.valor)} %` : formatearPesos(d.valor);
}

/** Totales del carrito, o el mensaje de por qué no se pueden calcular (ej. un descuento mayor que el valor). */
export function totalesDe(lineas: Linea[], descuentoGeneral: Descuento | null): TotalesVenta | string | null {
  if (!lineas.length) return null;
  try {
    return calcularTotales(
      lineas.map((l) => ({
        precioUnitario: l.producto.precioVenta,
        cantidad: l.cantidad,
        porcentajeIva: l.producto.porcentajeIva,
        descuento: l.descuento,
      })),
      descuentoGeneral,
    );
  } catch (e) {
    if (e instanceof ErrorTotales) return e.message;
    throw e;
  }
}

/** Mensaje si la cantidad pedida no está en stock; null si alcanza. */
export function faltaStock(producto: ProductoCaja, cantidad: Decimal) {
  const stock = new Decimal(producto.stock);
  if (stock.lte(0)) return `No hay stock de "${producto.nombre}".`;
  if (cantidad.gt(stock)) {
    return `No hay suficiente stock de "${producto.nombre}": solo quedan ${formatearCantidad(stock)} ${unidadCorta(producto.unidad)}.`;
  }
  return null;
}

type Dialogo =
  | { tipo: "cantidad"; producto: ProductoCaja; nueva: boolean }
  | { tipo: "descuento"; productoId: string | null }
  | { tipo: "cliente" }
  | { tipo: "cobrar" }
  | { tipo: "cancelar" }
  | null;

function leerGuardado(clave: string): Guardado {
  try {
    const texto = localStorage.getItem(clave);
    if (texto) {
      const g = JSON.parse(texto) as Partial<Guardado>;
      return { lineas: g.lineas ?? [], descuentoGeneral: g.descuentoGeneral ?? null, cliente: g.cliente ?? null };
    }
  } catch {
    // Carrito dañado o navegador sin almacenamiento: se empieza vacío.
  }
  return { lineas: [], descuentoGeneral: null, cliente: null };
}

/** La caja solo se dibuja en el navegador (ver caja-cliente.tsx), así puede leer el carrito guardado desde el inicio. */
export function Caja({ negocioId }: { negocioId: string }) {
  const clave = `carrito:${negocioId}`;
  const [inicial] = useState(() => leerGuardado(clave));
  const [lineas, setLineas] = useState<Linea[]>(inicial.lineas);
  const [descuentoGeneral, setDescuentoGeneral] = useState<Descuento | null>(inicial.descuentoGeneral);
  const [cliente, setCliente] = useState<ClienteVista | null>(inicial.cliente);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  // ─── Carrito guardado en el navegador ───────────────────────────────────
  /** Pone los precios y el stock de hoy; si un producto ya no está activo, sale del carrito. */
  const aplicarFrescos = useCallback((frescos: ProductoCaja[]) => {
    const porId = new Map(frescos.map((p) => [p.id, p]));
    setLineas((ls) => ls.flatMap((l) => (porId.has(l.producto.id) ? [{ ...l, producto: porId.get(l.producto.id)! }] : [])));
  }, []);

  const actualizarPrecios = useCallback(
    (actuales: Linea[]) => {
      if (actuales.length) refrescarCarrito(actuales.map((l) => l.producto.id)).then(aplicarFrescos, () => {});
    },
    [aplicarFrescos],
  );

  // Los precios pudieron cambiar desde que se guardó el carrito.
  useEffect(() => {
    if (!inicial.lineas.length) return;
    refrescarCarrito(inicial.lineas.map((l) => l.producto.id)).then(aplicarFrescos, () => {});
  }, [inicial, aplicarFrescos]);

  useEffect(() => {
    try {
      if (lineas.length || cliente) {
        localStorage.setItem(clave, JSON.stringify({ lineas, descuentoGeneral, cliente } satisfies Guardado));
      } else {
        localStorage.removeItem(clave);
      }
    } catch {
      // Sin almacenamiento: el carrito vive solo en la pantalla.
    }
  }, [clave, lineas, descuentoGeneral, cliente]);

  const enfocar = useCallback(() => {
    // En el computador de la caja (con mouse o pantalla táctil) el buscador siempre queda
    // listo para el lector de códigos. En el celular no: abriría el teclado a cada rato.
    const celular = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 768;
    if (!celular) buscador.current?.focus();
  }, []);

  const limpiar = useCallback(() => {
    setLineas([]);
    setDescuentoGeneral(null);
    setCliente(null);
    setAviso(null);
  }, []);

  // ─── Agregar y cambiar productos ────────────────────────────────────────
  // Copia al día del carrito para calcular sin esperar a que React vuelva a pintar.
  const lineasRef = useRef(lineas);
  useEffect(() => {
    lineasRef.current = lineas;
  }, [lineas]);

  const fijarCantidad = useCallback((producto: ProductoCaja, cantidad: Decimal, sumar: boolean) => {
    const ls = lineasRef.current;
    const i = ls.findIndex((l) => l.producto.id === producto.id);
    const total = sumar && i >= 0 ? new Decimal(ls[i].cantidad).plus(cantidad) : cantidad;
    const error = faltaStock(producto, total);
    setAviso(error);
    if (error) return error;
    const nuevas =
      i >= 0
        ? ls.map((l, j) => (j === i ? { ...l, producto, cantidad: total.toString() } : l))
        : [...ls, { producto, cantidad: total.toString(), descuento: null }];
    lineasRef.current = nuevas;
    setLineas(nuevas);
    setResaltado(producto.id);
    return null;
  }, []);

  const agregar = useCallback(
    (producto: ProductoCaja) => {
      if (producto.fraccionado) {
        setDialogo({ tipo: "cantidad", producto, nueva: true });
        return;
      }
      fijarCantidad(producto, new Decimal(1), true);
    },
    [fijarCantidad],
  );

  const quitar = (id: string) => setLineas((ls) => ls.filter((l) => l.producto.id !== id));

  const cambiarEnUno = (l: Linea, paso: 1 | -1) => {
    const nueva = new Decimal(l.cantidad).plus(paso);
    if (nueva.lte(0)) return;
    fijarCantidad(l.producto, nueva, false);
  };

  // ─── Totales ────────────────────────────────────────────────────────────
  const totales = useMemo(() => totalesDe(lineas, descuentoGeneral), [lineas, descuentoGeneral]);
  const errorTotales = typeof totales === "string" ? totales : null;
  const t = typeof totales === "object" ? totales : null;
  const unidades = lineas.reduce((a, l) => a.plus(l.cantidad), new Decimal(0));
  const puedeCobrar = !!t && t.total >= 0 && !errorTotales;

  // ─── Atajos de teclado ──────────────────────────────────────────────────
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (document.querySelector("dialog[open]")) return; // cada ventana maneja sus teclas
      if (e.key === "F2") {
        e.preventDefault();
        buscador.current?.focus();
        buscador.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (puedeCobrar) setDialogo({ tipo: "cobrar" });
      } else if (e.key === "F8") {
        e.preventDefault();
        if (lineas.length) setDialogo({ tipo: "descuento", productoId: null });
      } else if (e.key === "Escape" && document.activeElement !== buscador.current && lineas.length) {
        setDialogo({ tipo: "cancelar" });
      }
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [puedeCobrar, lineas.length]);

  const cerrarDialogo = () => setDialogo(null);

  // Cuando se cierra cualquier ventana, el buscador vuelve a quedar listo
  // (por ejemplo, si la ventana se abrió tocando un botón).
  useEffect(() => {
    const alCerrar = () => {
      if (document.activeElement !== buscador.current) enfocar();
    };
    document.addEventListener("close", alCerrar, true);
    return () => document.removeEventListener("close", alCerrar, true);
  }, [enfocar]);

  const lineaDescuento = dialogo?.tipo === "descuento" && dialogo.productoId
    ? lineas.find((l) => l.producto.id === dialogo.productoId)
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <section className="min-w-0 space-y-3">
        <Buscador
          refInput={buscador}
          alElegir={(p) => {
            agregar(p);
          }}
          alAvisar={setAviso}
          onEscapeVacio={() => lineas.length && setDialogo({ tipo: "cancelar" })}
        />

        {aviso && (
          <p role="alert" className="flex items-start justify-between gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-destructive">
            <span>{aviso}</span>
            <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="shrink-0">
              <X className="size-4" />
            </button>
          </p>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Cliente:</span>
          {cliente ? (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1 pl-3">
              <button type="button" className="truncate font-medium" onClick={() => setDialogo({ tipo: "cliente" })}>
                {cliente.nombre}
                {cliente.numeroDocumento && <span className="font-normal text-muted-foreground"> · {cliente.numeroDocumento}</span>}
              </button>
              <button type="button" onClick={() => setCliente(null)} aria-label="Quitar cliente" className="rounded-full p-1 hover:bg-muted">
                <X className="size-3.5" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setDialogo({ tipo: "cliente" })}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-muted-foreground hover:text-foreground"
            >
              <UserRound className="size-4" /> Agregar cliente (opcional)
            </button>
          )}
        </div>

        {lineas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <ScanBarcode className="size-6" />
            </div>
            <p className="font-semibold">Escanea o busca un producto para empezar</p>
            <p className="text-sm text-muted-foreground">Si lo escaneas otra vez, se suma uno más.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {lineas.map((l, i) => {
              const calc = t?.lineas[i];
              return (
                <li
                  key={l.producto.id}
                  className={cn(
                    "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 transition-colors md:grid-cols-[minmax(0,1fr)_auto_90px_100px_auto] md:px-4",
                    resaltado === l.producto.id && "bg-accent/40",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{l.producto.nombre}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {l.producto.codigo} · {formatearPesos(l.producto.precioVenta)}
                      {l.producto.unidad !== "UNIDAD" && ` / ${unidadCorta(l.producto.unidad)}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDialogo({ tipo: "descuento", productoId: l.producto.id })}
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 text-sm",
                        l.descuento ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {l.descuento ? (
                        <>
                          Descuento {textoDescuento(l.descuento)}
                          {calc ? ` · − ${formatearPesos(calc.descuentoLinea)}` : ""}
                        </>
                      ) : (
                        <>
                          <Percent className="size-3.5" /> Descuento
                        </>
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => quitar(l.producto.id)}
                    aria-label={`Quitar ${l.producto.nombre}`}
                    className="row-start-1 col-start-2 self-start rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:col-start-5 md:self-center"
                  >
                    <X className="size-5" />
                  </button>

                  <div className="flex h-12 items-center overflow-hidden rounded-lg border bg-muted/40 md:col-start-2 md:row-start-1">
                    <button
                      type="button"
                      onClick={() => cambiarEnUno(l, -1)}
                      disabled={new Decimal(l.cantidad).lte(1)}
                      aria-label="Uno menos"
                      className="flex h-full w-12 items-center justify-center hover:bg-muted disabled:opacity-40"
                    >
                      <Minus className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialogo({ tipo: "cantidad", producto: l.producto, nueva: false })}
                      className="h-full min-w-16 bg-background px-2 font-semibold tabular-nums"
                      aria-label="Cambiar cantidad"
                    >
                      {formatearCantidad(l.cantidad)}
                      {l.producto.unidad !== "UNIDAD" && ` ${unidadCorta(l.producto.unidad)}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => cambiarEnUno(l, 1)}
                      aria-label="Uno más"
                      className="flex h-full w-12 items-center justify-center hover:bg-muted"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>

                  <p className="hidden text-right tabular-nums text-muted-foreground md:block">
                    {formatearPesos(l.producto.precioVenta)}
                  </p>
                  <p className="text-right text-lg font-semibold tabular-nums md:text-base">
                    {calc ? formatearPesos(calc.subtotal - calc.descuentoLinea) : "—"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Productos</dt>
              <dd className="tabular-nums">
                {lineas.length}
                {lineas.length > 0 && ` (${formatearCantidad(unidades)} ${unidades.eq(1) ? "unidad" : "unidades"})`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatearPesos(t?.subtotal ?? 0)}</dd>
            </div>
            {!!t?.descuento && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <dt>
                  Descuentos
                  {descuentoGeneral && <span className="text-muted-foreground"> (general {textoDescuento(descuentoGeneral)})</span>}
                </dt>
                <dd className="tabular-nums">− {formatearPesos(t.descuento)}</dd>
              </div>
            )}
          </dl>
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground">Total a pagar</p>
            <p className="text-4xl font-bold tracking-tight tabular-nums md:text-5xl" data-testid="total">
              {formatearPesos(t?.total ?? 0)}
            </p>
            {!!t?.iva && <p className="mt-1 text-xs text-muted-foreground">Incluye IVA de {formatearPesos(t.iva)}</p>}
            {errorTotales && <p role="alert" className="mt-2 text-sm text-destructive">{errorTotales}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="lg"
              disabled={!lineas.length}
              onClick={() => setDialogo({ tipo: "descuento", productoId: null })}
            >
              Descuento <Tecla>F8</Tecla>
            </Button>
            <Button variant="outline" size="lg" disabled={!lineas.length && !cliente} onClick={() => setDialogo({ tipo: "cancelar" })}>
              Cancelar <Tecla>Esc</Tecla>
            </Button>
          </div>
        </div>

        <div className="sticky bottom-20 z-20 mt-3 md:bottom-4 lg:static">
          <Button
            size="lg"
            className="h-16 w-full rounded-xl text-xl font-semibold shadow-lg lg:shadow-xs"
            disabled={!puedeCobrar}
            onClick={() => setDialogo({ tipo: "cobrar" })}
          >
            <ShoppingCart className="size-5" />
            Cobrar {t ? formatearPesos(t.total) : ""} <Tecla>F4</Tecla>
          </Button>
        </div>
      </aside>

      <DialogoCantidad
        abierto={dialogo?.tipo === "cantidad"}
        producto={dialogo?.tipo === "cantidad" ? dialogo.producto : null}
        actual={
          dialogo?.tipo === "cantidad" && !dialogo.nueva
            ? lineas.find((l) => l.producto.id === dialogo.producto.id)?.cantidad ?? null
            : null
        }
        onConfirmar={(cantidad) => {
          if (dialogo?.tipo !== "cantidad") return null;
          const error = fijarCantidad(dialogo.producto, cantidad, dialogo.nueva);
          if (!error) cerrarDialogo();
          return error;
        }}
        onCerrar={cerrarDialogo}
      />

      <DialogoDescuento
        abierto={dialogo?.tipo === "descuento"}
        titulo={lineaDescuento ? `Descuento en ${lineaDescuento.producto.nombre}` : "Descuento a toda la venta"}
        actual={lineaDescuento ? lineaDescuento.descuento : descuentoGeneral}
        probar={(d) => {
          const nuevas = lineaDescuento
            ? lineas.map((l) => (l.producto.id === lineaDescuento.producto.id ? { ...l, descuento: d } : l))
            : lineas;
          const r = totalesDe(nuevas, lineaDescuento ? descuentoGeneral : d);
          return typeof r === "string" ? r : null;
        }}
        onConfirmar={(d) => {
          if (lineaDescuento) {
            setLineas((ls) => ls.map((l) => (l.producto.id === lineaDescuento.producto.id ? { ...l, descuento: d } : l)));
          } else {
            setDescuentoGeneral(d);
          }
          cerrarDialogo();
        }}
        onCerrar={cerrarDialogo}
      />

      <DialogoCliente
        abierto={dialogo?.tipo === "cliente"}
        onElegir={(c) => {
          setCliente(c);
          cerrarDialogo();
        }}
        onCerrar={cerrarDialogo}
      />

      <DialogoCancelar
        abierto={dialogo?.tipo === "cancelar"}
        onConfirmar={() => {
          limpiar();
          cerrarDialogo();
        }}
        onCerrar={cerrarDialogo}
      />

      <DialogoCobrar
        abierto={dialogo?.tipo === "cobrar"}
        negocioId={negocioId}
        lineas={lineas}
        descuentoGeneral={descuentoGeneral}
        cliente={cliente}
        total={t?.total ?? 0}
        onVendida={limpiar}
        onPreciosCambiaron={() => actualizarPrecios(lineas)}
        onCerrar={cerrarDialogo}
      />
    </div>
  );
}

// ─── Buscador ─────────────────────────────────────────────────────────────

function Buscador({
  refInput,
  alElegir,
  alAvisar,
  onEscapeVacio,
}: {
  refInput: React.RefObject<HTMLInputElement | null>;
  alElegir: (p: ProductoCaja) => void;
  alAvisar: (mensaje: string | null) => void;
  onEscapeVacio: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ProductoCaja[]>([]);
  const [buscado, setBuscado] = useState("");
  const [indice, setIndice] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const pedido = useRef(0);

  const buscar = useCallback(async (q: string) => {
    const n = ++pedido.current;
    const r = await buscarProductoCaja(q);
    return n === pedido.current ? r : null; // una respuesta vieja no pisa a la nueva
  }, []);

  // Mientras escribe a mano: busca después de una pausa corta.
  useEffect(() => {
    const q = texto.trim();
    if (!q) {
      pedido.current++;
      return;
    }
    const espera = setTimeout(async () => {
      const r = await buscar(q);
      if (!r) return;
      setResultados(r.resultados);
      setBuscado(q);
      setIndice(0);
      setAbierto(true);
    }, 200);
    return () => clearTimeout(espera);
  }, [texto, buscar]);

  const elegir = (p: ProductoCaja) => {
    alElegir(p);
    pedido.current++;
    setTexto("");
    setResultados([]);
    setBuscado("");
    setAbierto(false);
  };

  async function alPresionar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!resultados.length) return;
      setAbierto(true);
      setIndice((i) => (i + (e.key === "ArrowDown" ? 1 : resultados.length - 1)) % resultados.length);
    } else if (e.key === "Escape") {
      if (texto) {
        e.preventDefault();
        setTexto("");
        setAbierto(false);
      } else {
        onEscapeVacio();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = texto.trim();
      if (!q) return;
      // El lector de código de barras escribe el código y manda Enter enseguida:
      // se busca ya, sin esperar la pausa, y si el código existe entra directo.
      if (q === buscado && resultados.length) {
        elegir(resultados[Math.min(indice, resultados.length - 1)]);
        return;
      }
      const r = await buscar(q);
      if (!r) return;
      if (r.exacto) elegir(r.exacto);
      else if (r.resultados.length === 1) elegir(r.resultados[0]);
      else if (r.resultados.length) {
        setResultados(r.resultados);
        setBuscado(q);
        setIndice(0);
        setAbierto(true);
      } else {
        alAvisar(`No encontramos "${q}". Revisa el código o busca por nombre.`);
        setTexto("");
      }
    }
  }

  const mostrar = abierto && texto.trim() && buscado === texto.trim();

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={refInput}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          alAvisar(null);
        }}
        onKeyDown={alPresionar}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Escanea o escribe código o nombre…"
        autoComplete="off"
        autoFocus
        enterKeyHint="search"
        role="combobox"
        aria-expanded={!!mostrar}
        aria-controls="resultados-caja"
        aria-label="Buscar producto"
        className="h-14 w-full rounded-xl border-2 border-primary/70 bg-background pr-14 pl-12 text-lg outline-none focus:border-primary focus:ring-4 focus:ring-ring/20"
      />
      <span className="absolute top-1/2 right-4 -translate-y-1/2">
        <Tecla>F2</Tecla>
      </span>
      {mostrar && (
        <ul
          id="resultados-caja"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
        >
          {resultados.length === 0 ? (
            <li className="px-4 py-3 text-muted-foreground">No encontramos productos con &quot;{buscado}&quot;.</li>
          ) : (
            resultados.map((p, i) => {
              const sinStock = new Decimal(p.stock).lte(0);
              return (
                <li key={p.id} role="option" aria-selected={i === indice}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(p)}
                    onMouseEnter={() => setIndice(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left",
                      i === indice && "bg-accent",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nombre}</p>
                      <p className={cn("truncate text-sm", sinStock ? "text-destructive" : "text-muted-foreground")}>
                        {p.codigo} · {sinStock ? "Sin stock" : `Quedan ${formatearCantidad(p.stock)} ${unidadCorta(p.unidad)}`}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">{formatearPesos(p.precioVenta)}</p>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
