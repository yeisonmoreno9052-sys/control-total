"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Minus, Pause, Percent, Plus, ScanBarcode, Search, ShoppingCart, Trash2, UserRound, X } from "lucide-react";
import { esErrorDeRed, useConexion } from "@/components/sin-conexion/conexion";
import { Button } from "@/components/ui/button";
import { Tecla } from "@/components/ui/dialogo";
import type { ClienteVista } from "@/lib/datos/clientes";
import type { BotonRapido, ProductoCaja } from "@/lib/datos/productos";
import { formatearPesos } from "@/lib/formato";
import { Decimal, formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import { calcularTotales, ErrorTotales, type Descuento, type TotalesVenta } from "@/lib/ventas/totales";
import { buscarEnCopia } from "@/lib/sin-conexion/buscar";
import { cn } from "@/lib/utils";
import { Miniatura } from "@/components/inventario/miniatura";
import type { UnidadMedida } from "@/generated/prisma/enums";
import { buscarProductoCaja, refrescarCarrito } from "./acciones";
import { DialogoCliente } from "./dialogo-cliente";
import { DialogoCobrar } from "./dialogo-cobrar";
import { DialogoDejarEnEspera, DialogoEnEspera, guardarEnEspera, leerEnEspera, type VentaEnEspera } from "./dialogos-espera";
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
  if (producto.controlaStock === false) return null; // tinto, jugos: se venden siempre
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
  | { tipo: "dejarEnEspera" }
  | { tipo: "enEspera" }
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
export function Caja({ negocioId, botones = [] }: { negocioId: string; botones?: BotonRapido[] }) {
  // Con botones rápidos (cafeterías) la caja muestra cuadros para tocar y el pedido va a un lado.
  const modoBotones = botones.length > 0;
  const clave = `carrito:${negocioId}`;
  const [inicial] = useState(() => leerGuardado(clave));
  const [lineas, setLineas] = useState<Linea[]>(inicial.lineas);
  const [descuentoGeneral, setDescuentoGeneral] = useState<Descuento | null>(inicial.descuentoGeneral);
  const [cliente, setCliente] = useState<ClienteVista | null>(inicial.cliente);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const claveEspera = `espera:${negocioId}`;
  const [enEspera, setEnEspera] = useState<VentaEnEspera[]>(() => leerEnEspera(claveEspera));
  const [aviso, setAviso] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const { enLinea, marcarSinConexion, productos } = useConexion();
  // Sin internet no se bloquea por stock: la copia puede estar atrasada y el cliente está ahí.
  const enLineaRef = useRef(enLinea);
  useEffect(() => {
    enLineaRef.current = enLinea;
  }, [enLinea]);

  const buscarProductos = useCallback(
    async (q: string) => {
      if (enLineaRef.current) {
        try {
          return await buscarProductoCaja(q);
        } catch (error) {
          if (!esErrorDeRed(error)) throw error;
          marcarSinConexion();
        }
      }
      return buscarEnCopia(await productos(), q);
    },
    [marcarSinConexion, productos],
  );

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

  useEffect(() => {
    guardarEnEspera(claveEspera, enEspera);
  }, [claveEspera, enEspera]);

  /** Nombre por defecto: "Venta 1", "Venta 2"… sin repetir los que ya están en espera. */
  const nombreSugerido = (lista: VentaEnEspera[]) => {
    let n = 1;
    while (lista.some((v) => v.nombre === `Venta ${n}`)) n++;
    return `Venta ${n}`;
  };

  const carritoComoEspera = (nombre: string): VentaEnEspera => ({
    id: crypto.randomUUID(),
    nombre,
    creada: new Date().toISOString(),
    lineas,
    descuentoGeneral,
    cliente,
  });

  const enfocar = useCallback(() => {
    // En el computador de la caja (con mouse o pantalla táctil) el buscador siempre queda
    // listo para el lector de códigos. En el celular no: abriría el teclado a cada rato.
    // Con botones rápidos en una tablet tampoco: se vende tocando cuadros, no escribiendo.
    const tactil = window.matchMedia("(pointer: coarse)").matches;
    const celular = tactil && window.innerWidth < 768;
    if (!celular && !(modoBotones && tactil)) buscador.current?.focus();
  }, [modoBotones]);

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
    const error = enLineaRef.current ? faltaStock(producto, total) : null;
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

  const hayEnEspera = enEspera.length > 0;

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
      } else if (e.key === "F6") {
        e.preventDefault();
        if (lineas.length) setDialogo({ tipo: "dejarEnEspera" });
        else if (hayEnEspera) setDialogo({ tipo: "enEspera" });
      } else if (e.key === "F8") {
        e.preventDefault();
        if (lineas.length) setDialogo({ tipo: "descuento", productoId: null });
      } else if (e.key === "Escape" && document.activeElement !== buscador.current && lineas.length) {
        setDialogo({ tipo: "cancelar" });
      }
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [puedeCobrar, lineas.length, hayEnEspera]);

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

  const lineaDescuento =
    dialogo?.tipo === "descuento" && dialogo.productoId ? lineas.find((l) => l.producto.id === dialogo.productoId) : null;

  return (
    <div
      className={cn(
        "grid gap-4 lg:gap-6",
        // Con botones, en pantalla ancha la caja ocupa justo la pantalla: los cuadros se desplazan
        // por dentro y el pedido con el botón Cobrar siempre se ven.
        modoBotones
          ? "lg:h-[calc(100dvh-13rem)] lg:min-h-[28rem] lg:grid-cols-[minmax(0,1fr)_380px]"
          : "lg:grid-cols-[minmax(0,1fr)_340px]",
      )}
    >
      <section className={cn("min-w-0 space-y-3", modoBotones && "lg:-m-1 lg:overflow-y-auto lg:p-1")}>
        <Buscador
          enfocarAlAbrir={!modoBotones}
          placeholder={modoBotones ? "Busca un producto que no esté en los botones…" : undefined}
          refInput={buscador}
          buscarProductos={buscarProductos}
          alElegir={(p) => {
            agregar(p);
          }}
          alAvisar={setAviso}
          onEscapeVacio={() => lineas.length && setDialogo({ tipo: "cancelar" })}
        />

        {aviso && (
          <p
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-destructive"
          >
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
                {cliente.numeroDocumento && (
                  <span className="font-normal text-muted-foreground"> · {cliente.numeroDocumento}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setCliente(null)}
                aria-label="Quitar cliente"
                className="rounded-full p-1 hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ) : !enLinea ? (
            <span className="text-muted-foreground">sin cliente (sin internet no se pueden buscar clientes)</span>
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

        {modoBotones ? (
          <CuadrosRapidos botones={botones} lineas={lineas} alTocar={agregar} />
        ) : lineas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <ScanBarcode className="size-6" />
            </div>
            <p className="font-semibold">Escanea o busca un producto para empezar</p>
            <p className="text-sm text-muted-foreground">Si lo escaneas otra vez, se suma uno más.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card shadow-suave">
            {lineas.map((l, i) => {
              const calc = t?.lineas[i];
              return (
                <li
                  key={l.producto.id}
                  className={cn(
                    "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 p-3 transition-colors md:grid-cols-[minmax(0,1fr)_auto_100px_auto] md:px-4 xl:grid-cols-[minmax(0,1fr)_auto_90px_100px_auto]",
                    resaltado === l.producto.id && "bg-accent/40",
                  )}
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-semibold leading-snug">{l.producto.nombre}</p>
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
                    className="row-start-1 col-start-2 self-start rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:col-start-4 md:self-center xl:col-start-5"
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
                      className="h-full min-w-16 bg-card px-2 font-semibold tabular-nums"
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

                  <p className="hidden text-right tabular-nums text-muted-foreground xl:block">
                    {formatearPesos(l.producto.precioVenta)}
                  </p>
                  <p className="text-right text-lg font-semibold whitespace-nowrap tabular-nums md:text-base">
                    {calc ? formatearPesos(calc.subtotal - calc.descuentoLinea) : "—"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className={modoBotones ? "lg:flex lg:min-h-0 lg:flex-col" : "lg:sticky lg:top-20 lg:self-start"}>
        <div
          className={cn(
            "space-y-4 rounded-2xl border bg-card p-4 shadow-suave md:p-5",
            modoBotones && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:space-y-0 lg:gap-4",
          )}
        >
          {modoBotones && (
            <PedidoCompacto
              lineas={lineas}
              totales={t}
              resaltado={resaltado}
              alCambiar={cambiarEnUno}
              alQuitar={quitar}
              alCantidad={(l) => setDialogo({ tipo: "cantidad", producto: l.producto, nueva: false })}
              alDescuento={(l) => setDialogo({ tipo: "descuento", productoId: l.producto.id })}
            />
          )}
          {/* Con botones, el pedido ya muestra cada producto: el resumen solo sale si hay descuentos. */}
          {(!modoBotones || !!t?.descuento) && (
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
                    {descuentoGeneral && (
                      <span className="text-muted-foreground"> (general {textoDescuento(descuentoGeneral)})</span>
                    )}
                  </dt>
                  <dd className="tabular-nums">− {formatearPesos(t.descuento)}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="rounded-xl bg-franja px-4 py-4 text-white">
            <p className="text-sm text-white/75">Total a pagar</p>
            <p className="text-4xl font-bold tracking-tight tabular-nums md:text-5xl" data-testid="total">
              {formatearPesos(t?.total ?? 0)}
            </p>
            {!!t?.iva && <p className="mt-1 text-xs text-white/75">Incluye IVA de {formatearPesos(t.iva)}</p>}
            {errorTotales && (
              <p role="alert" className="mt-2 rounded-md bg-white/90 px-2 py-1 text-sm text-destructive">
                {errorTotales}
              </p>
            )}
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
            <Button
              variant="outline"
              size="lg"
              disabled={!lineas.length && !cliente}
              onClick={() => setDialogo({ tipo: "cancelar" })}
            >
              Cancelar <Tecla>Esc</Tecla>
            </Button>
            <Button variant="outline" size="lg" disabled={!lineas.length} onClick={() => setDialogo({ tipo: "dejarEnEspera" })}>
              <Pause /> En espera <Tecla>F6</Tecla>
            </Button>
            <Button
              variant={hayEnEspera ? "secondary" : "outline"}
              size="lg"
              disabled={!hayEnEspera}
              onClick={() => setDialogo({ tipo: "enEspera" })}
            >
              <Clock /> Retomar{hayEnEspera && ` (${enEspera.length})`}
            </Button>
          </div>
        </div>

        <div className="sticky bottom-[5.25rem] z-20 mt-3 md:bottom-4 lg:static">
          <Button
            size="lg"
            className="h-16 w-full rounded-xl bg-gradient-to-r from-destacado-desde to-destacado-hasta text-xl font-semibold text-white shadow-[var(--sombra-destacado)] hover:opacity-95"
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
            ? (lineas.find((l) => l.producto.id === dialogo.producto.id)?.cantidad ?? null)
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

      <DialogoDejarEnEspera
        abierto={dialogo?.tipo === "dejarEnEspera"}
        sugerido={nombreSugerido(enEspera)}
        onConfirmar={(nombre) => {
          setEnEspera((lista) => [...lista, carritoComoEspera(nombre)]);
          limpiar();
          cerrarDialogo();
        }}
        onCerrar={cerrarDialogo}
      />

      <DialogoEnEspera
        abierto={dialogo?.tipo === "enEspera"}
        ventas={enEspera}
        hayCarrito={lineas.length > 0}
        onRetomar={(v) => {
          const resto = enEspera.filter((x) => x.id !== v.id);
          // La venta que estaba en la caja no se pierde: pasa a espera.
          setEnEspera(lineas.length ? [...resto, carritoComoEspera(nombreSugerido(resto))] : resto);
          setLineas(v.lineas);
          setDescuentoGeneral(v.descuentoGeneral);
          setCliente(v.cliente);
          setAviso(null);
          // Los precios y el stock pudieron cambiar mientras esperaba.
          if (enLinea) actualizarPrecios(v.lineas);
          cerrarDialogo();
        }}
        onDescartar={(v) => setEnEspera((lista) => lista.filter((x) => x.id !== v.id))}
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

// ─── Botones rápidos (cafeterías) ─────────────────────────────────────────

/** Un color por categoría para ubicar rápido los cuadros. Se repiten si hay más categorías. */
const COLORES_CATEGORIA = ["#f59e0b", "#0ea5e9", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316"];

function CuadrosRapidos({
  botones,
  lineas,
  alTocar,
}: {
  botones: BotonRapido[];
  lineas: Linea[];
  alTocar: (p: ProductoCaja) => void;
}) {
  const [filtro, setFiltro] = useState<string | null>(null);
  const categorias = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const b of botones) {
      const clave = b.categoriaId ?? "";
      if (!vistas.has(clave)) vistas.set(clave, b.categoria ?? "Otros");
    }
    return [...vistas].map(([id, nombre], i) => ({ id, nombre, color: COLORES_CATEGORIA[i % COLORES_CATEGORIA.length] }));
  }, [botones]);
  const colorDe = new Map(categorias.map((c) => [c.id, c.color]));
  const cantidad = new Map(lineas.map((l) => [l.producto.id, l.cantidad]));
  const visibles = filtro === null ? botones : botones.filter((b) => (b.categoriaId ?? "") === filtro);
  // Si algún producto tiene foto, los que no tienen llevan un cuadro de color del mismo tamaño
  // para que la cuadrícula quede pareja.
  const conFotos = botones.some((b) => b.fotoUrl);

  return (
    <div className="space-y-3">
      {categorias.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
          {[{ id: null, nombre: "Todos" }, ...categorias].map((c) => (
            <button
              key={c.id ?? "todos"}
              type="button"
              aria-pressed={filtro === c.id}
              onClick={() => setFiltro(c.id)}
              className={cn(
                "h-12 rounded-full border px-5 text-base font-semibold transition-colors",
                filtro === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-muted",
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {visibles.map((b) => {
          const n = cantidad.get(b.id);
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => alTocar(b)}
                style={{ borderTopColor: colorDe.get(b.categoriaId ?? "") }}
                className="relative flex h-full min-h-28 w-full flex-col overflow-hidden rounded-2xl border border-t-[6px] bg-card text-left shadow-suave transition active:scale-[0.97] active:bg-accent"
              >
                {b.fotoUrl ? (
                  <FotoCuadro src={b.fotoUrl} />
                ) : (
                  conFotos && <SinFoto nombre={b.nombre} color={colorDe.get(b.categoriaId ?? "")} />
                )}
                <span className="flex flex-1 flex-col justify-between gap-2 p-3">
                  <span className={cn("line-clamp-3 text-lg leading-tight font-semibold", !b.fotoUrl && "pr-7")}>{b.nombre}</span>
                  <span className="text-lg font-bold text-primary tabular-nums">{formatearPesos(b.precioVenta)}</span>
                </span>
                {n && (
                  <span
                    className="absolute top-2 right-2 min-w-8 rounded-full bg-primary px-2 py-0.5 text-center text-base font-bold text-primary-foreground tabular-nums shadow-md"
                    aria-label={`${formatearCantidad(n)} en el pedido`}
                  >
                    {formatearCantidad(n)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Lugar de la foto para un producto que no tiene: su inicial sobre el color de la categoría. */
function SinFoto({ nombre, color }: { nombre: string; color: string | undefined }) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color }}
      className="flex aspect-[4/3] w-full items-center justify-center text-5xl font-bold text-white/90"
    >
      {nombre.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Foto del cuadro. Sin internet y sin copia en el navegador, el cuadro queda solo con el nombre. */
function FotoCuadro({ src }: { src: string }) {
  const [falla, setFalla] = useState(false);
  if (falla) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" onError={() => setFalla(true)} className="aspect-[4/3] w-full bg-muted object-cover" />
  );
}

/** El pedido al lado de los cuadros: renglones cortos, botones grandes para el dedo. */
function PedidoCompacto({
  lineas,
  totales,
  resaltado,
  alCambiar,
  alQuitar,
  alCantidad,
  alDescuento,
}: {
  lineas: Linea[];
  totales: TotalesVenta | null;
  resaltado: string | null;
  alCambiar: (l: Linea, paso: 1 | -1) => void;
  alQuitar: (id: string) => void;
  alCantidad: (l: Linea) => void;
  alDescuento: (l: Linea) => void;
}) {
  if (!lineas.length) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-8 text-center lg:flex lg:flex-1 lg:flex-col lg:justify-center">
        <p className="font-semibold">Pedido vacío</p>
        <p className="text-sm text-muted-foreground">Toca un producto para empezar.</p>
      </div>
    );
  }
  return (
    <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <h2 className="mb-1 font-semibold">Pedido</h2>
      <ul className="divide-y">
        {lineas.map((l, i) => {
          const calc = totales?.lineas[i];
          const uno = new Decimal(l.cantidad).lte(1);
          return (
            <li
              key={l.producto.id}
              className={cn("flex items-center gap-2 py-2 transition-colors", resaltado === l.producto.id && "bg-accent/40")}
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 leading-snug font-semibold">{l.producto.nombre}</p>
                <button
                  type="button"
                  onClick={() => alDescuento(l)}
                  className={cn(
                    "text-sm",
                    l.descuento ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.descuento ? `Descuento ${textoDescuento(l.descuento)}` : "Descuento"}
                </button>
              </div>
              <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-lg border bg-muted/40">
                <button
                  type="button"
                  onClick={() => (uno ? alQuitar(l.producto.id) : alCambiar(l, -1))}
                  aria-label={uno ? `Quitar ${l.producto.nombre}` : "Uno menos"}
                  className={cn("flex h-full w-11 items-center justify-center hover:bg-muted", uno && "text-destructive")}
                >
                  {uno ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => alCantidad(l)}
                  className="h-full min-w-10 bg-card px-1 text-lg font-semibold tabular-nums"
                  aria-label="Cambiar cantidad"
                >
                  {formatearCantidad(l.cantidad)}
                </button>
                <button
                  type="button"
                  onClick={() => alCambiar(l, 1)}
                  aria-label="Uno más"
                  className="flex h-full w-11 items-center justify-center hover:bg-muted"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <p className="w-20 shrink-0 text-right font-semibold whitespace-nowrap tabular-nums">
                {calc ? formatearPesos(calc.subtotal - calc.descuentoLinea) : "—"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Buscador ─────────────────────────────────────────────────────────────

function Buscador({
  enfocarAlAbrir = true,
  placeholder = "Escanea o escribe código o nombre…",
  refInput,
  buscarProductos,
  alElegir,
  alAvisar,
  onEscapeVacio,
}: {
  enfocarAlAbrir?: boolean;
  placeholder?: string;
  refInput: React.RefObject<HTMLInputElement | null>;
  buscarProductos: (q: string) => Promise<{ exacto: ProductoCaja | null; resultados: ProductoCaja[] }>;
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
  // Mientras se resuelve un Enter (lector de códigos), la búsqueda de la pausa no lo pisa.
  const conEnter = useRef(false);

  const buscar = useCallback(
    async (q: string) => {
      const n = ++pedido.current;
      const r = await buscarProductos(q);
      return n === pedido.current ? r : null; // una respuesta vieja no pisa a la nueva
    },
    [buscarProductos],
  );

  // Mientras escribe a mano: busca después de una pausa corta.
  useEffect(() => {
    const q = texto.trim();
    if (!q) {
      pedido.current++;
      return;
    }
    const espera = setTimeout(async () => {
      if (conEnter.current) return;
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
      conEnter.current = true;
      const r = await buscar(q).finally(() => (conEnter.current = false));
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
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={enfocarAlAbrir}
        enterKeyHint="search"
        role="combobox"
        aria-expanded={!!mostrar}
        aria-controls="resultados-caja"
        aria-label="Buscar producto"
        className="h-14 w-full rounded-xl border-2 border-primary/70 bg-card pr-14 shadow-suave pl-12 text-lg outline-none focus:border-primary focus:ring-4 focus:ring-ring/20"
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
              const seCuenta = p.controlaStock !== false;
              const sinStock = seCuenta && new Decimal(p.stock).lte(0);
              return (
                <li key={p.id} role="option" aria-selected={i === indice}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(p)}
                    onMouseEnter={() => setIndice(i)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left", i === indice && "bg-accent")}
                  >
                    <Miniatura src={p.fotoUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nombre}</p>
                      <p className={cn("truncate text-sm", sinStock ? "text-destructive" : "text-muted-foreground")}>
                        {p.codigo}
                        {seCuenta && ` · ${sinStock ? "Sin stock" : `Quedan ${formatearCantidad(p.stock)} ${unidadCorta(p.unidad)}`}`}
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
