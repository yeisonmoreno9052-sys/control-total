"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Landmark, PackagePlus, Plus, Search, Trash2, TrendingDown, TrendingUp, UserPlus } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { costoPromedio, totalLinea } from "@/lib/compras/costos";
import type { ProductoCompra } from "@/lib/datos/compras";
import { formatearPesos } from "@/lib/formato";
import { formatearCantidad, leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "@/lib/inventario/cantidades";
import { precioSugerido } from "@/lib/inventario/precios";
import { IVAS, UNIDADES } from "@/lib/inventario/unidades";
import { cn } from "@/lib/utils";
import type { UnidadMedida } from "@/generated/prisma/enums";
import {
  buscarProductoFactura,
  crearProductoFactura,
  crearProveedorRapido,
  guardarFacturaAccion,
  refrescarProductosFactura,
} from "../../acciones";

type Proveedor = { id: string; nombre: string };

type Linea = {
  producto: ProductoCompra;
  cantidad: string;
  costo: number | null;
  /** null = automático: se actualiza el precio si el costo subió. */
  actualizar: boolean | null;
  /** Precio escrito a mano. null = el sugerido por el margen. */
  precio: number | null;
  confirmado: boolean;
};

type Borrador = {
  proveedorId: string;
  numero: string;
  fecha: string;
  tipo: "contado" | "credito";
  medio: "EFECTIVO" | "TRANSFERENCIA";
  desdeCaja: boolean;
  referencia: string;
  vencimiento: string;
  nota: string;
  lineas: Linea[];
};

const unidadCorta = (u: string) => UNIDADES[u as UnidadMedida]?.corto ?? "";

function sumarDias(dia: string, dias: number) {
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function leerBorrador(clave: string): Partial<Borrador> | null {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as Partial<Borrador>) : null;
  } catch {
    return null;
  }
}

/** Lo que resulta de una línea: costo promedio nuevo, si cambia el precio y a cuánto. */
function calcularLinea(l: Linea) {
  const p = l.producto;
  const cantidad = leerCantidad(l.cantidad);
  const problemaCantidad = l.cantidad.trim()
    ? (validarCantidad(cantidad, { fraccionado: p.fraccionado }) ?? (cantidad!.lte(0) ? "cero" : null))
    : "vacia";
  const valida = !problemaCantidad && l.costo !== null;
  const promedio = valida ? costoPromedio(p.stock, p.costo, cantidad!, l.costo!) : null;
  const total = valida ? totalLinea(cantidad!, l.costo!) : 0;
  const segunda = p.condicion === "DE_SEGUNDA";
  const cambioCosto = l.costo !== null && l.costo !== p.costo;
  const actualizar = segunda || (l.actualizar ?? (l.costo !== null && l.costo > p.costo));
  const sugerido = precioSugerido(promedio ?? l.costo ?? p.costo, p.margen);
  const precio = l.precio ?? (sugerido || p.precioVenta);
  return {
    cantidad,
    problemaCantidad,
    promedio,
    total,
    segunda,
    cambioCosto,
    actualizar,
    sugerido,
    precio,
  };
}

export function FormularioFactura({
  negocioId,
  hoy,
  proveedores: proveedoresIniciales,
  proveedorInicial,
  margenNegocio,
  cajaAbierta,
}: {
  negocioId: string;
  hoy: string;
  proveedores: Proveedor[];
  proveedorInicial: string | null;
  margenNegocio: number;
  cajaAbierta: boolean;
}) {
  const router = useRouter();
  const clave = `factura:${negocioId}`;
  const [inicial] = useState(() => leerBorrador(clave));
  const [proveedores, setProveedores] = useState(proveedoresIniciales);
  const [proveedorId, setProveedorId] = useState(
    (proveedorInicial && proveedoresIniciales.some((p) => p.id === proveedorInicial) ? proveedorInicial : null) ??
      (inicial?.proveedorId && proveedoresIniciales.some((p) => p.id === inicial.proveedorId) ? inicial.proveedorId : ""),
  );
  const [numero, setNumero] = useState(inicial?.numero ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha && inicial.fecha <= hoy ? inicial.fecha : hoy);
  const [tipo, setTipo] = useState<Borrador["tipo"]>(inicial?.tipo ?? "contado");
  const [medio, setMedio] = useState<Borrador["medio"]>(inicial?.medio ?? "EFECTIVO");
  const [desdeCaja, setDesdeCaja] = useState(cajaAbierta && (inicial?.desdeCaja ?? true));
  const [referencia, setReferencia] = useState(inicial?.referencia ?? "");
  const [vencimiento, setVencimiento] = useState(inicial?.vencimiento ?? "");
  const [nota, setNota] = useState(inicial?.nota ?? "");
  const [lineas, setLineas] = useState<Linea[]>(inicial?.lineas ?? []);
  const [dialogo, setDialogo] = useState<"proveedor" | "producto" | null>(null);
  const [textoNuevo, setTextoNuevo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);

  // Si había borrador, trae el costo y el stock de hoy de esos productos.
  useEffect(() => {
    const ids = (inicial?.lineas ?? []).map((l) => l.producto.id);
    if (!ids.length) return;
    refrescarProductosFactura(ids).then(
      (frescos) => {
        const porId = new Map(frescos.map((p) => [p.id, p]));
        setLineas((ls) => ls.filter((l) => porId.has(l.producto.id)).map((l) => ({ ...l, producto: porId.get(l.producto.id)! })));
      },
      () => undefined,
    );
  }, [inicial]);

  useEffect(() => {
    try {
      const borrador: Borrador = {
        proveedorId,
        numero,
        fecha,
        tipo,
        medio,
        desdeCaja,
        referencia,
        vencimiento,
        nota,
        lineas,
      };
      if (lineas.length || numero) localStorage.setItem(clave, JSON.stringify(borrador));
      else localStorage.removeItem(clave);
    } catch {
      // Sin almacenamiento: el borrador vive solo en la pantalla.
    }
  }, [clave, proveedorId, numero, fecha, tipo, medio, desdeCaja, referencia, vencimiento, nota, lineas]);

  const enfocarCantidad = (productoId: string) => setTimeout(() => document.getElementById(`cantidad-${productoId}`)?.focus(), 0);

  const agregar = useCallback((p: ProductoCompra) => {
    setAviso(null);
    setLineas((ls) =>
      ls.some((l) => l.producto.id === p.id)
        ? ls
        : [
            ...ls,
            {
              producto: p,
              cantidad: "",
              costo: p.costo || null,
              actualizar: null,
              precio: null,
              confirmado: false,
            },
          ],
    );
    enfocarCantidad(p.id);
  }, []);

  const cambiar = (id: string, cambios: Partial<Linea>) => {
    setLineas((ls) => ls.map((l) => (l.producto.id === id ? { ...l, ...cambios } : l)));
    setError(null);
  };

  const calculadas = lineas.map((l) => ({ linea: l, calc: calcularLinea(l) }));
  const total = calculadas.reduce((a, { calc }) => a + calc.total, 0);
  const vence = vencimiento || sumarDias(fecha, 30);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    const campos: Record<string, string> = {};
    if (!proveedorId) campos.proveedorId = "Elige el proveedor.";
    if (!numero.trim()) campos.numero = "Escribe el número de la factura.";
    for (const { linea, calc } of calculadas) {
      const id = linea.producto.id;
      if (calc.problemaCantidad)
        campos[`cantidad-${id}`] =
          calc.problemaCantidad in MENSAJES_CANTIDAD
            ? MENSAJES_CANTIDAD[calc.problemaCantidad as keyof typeof MENSAJES_CANTIDAD]
            : "Escribe la cantidad.";
      if (linea.costo === null) campos[`costo-${id}`] = "Escribe el costo.";
      if (calc.actualizar && !(calc.precio > 0)) campos[`precio-${id}`] = "Escribe el precio de venta.";
      if (calc.segunda && !linea.confirmado) campos[`confirmado-${id}`] = "Confirma el costo y el precio.";
    }
    setErrores(campos);
    if (!lineas.length) return setError("Agrega al menos un producto a la factura.");
    if (Object.keys(campos).length) return setError("Revisa los campos marcados.");

    setGuardando(true);
    setError(null);
    try {
      const r = await guardarFacturaAccion({
        proveedorId,
        numero,
        fecha,
        vencimiento: tipo === "credito" ? vence : null,
        nota,
        lineas: calculadas.map(({ linea, calc }) => ({
          productoId: linea.producto.id,
          cantidad: calc.cantidad!.toString(),
          costoUnitario: linea.costo!,
          precioVenta: calc.actualizar ? calc.precio : null,
          confirmado: linea.confirmado,
        })),
        pago:
          tipo === "credito"
            ? { tipo }
            : {
                tipo,
                medio,
                desdeCaja: medio === "EFECTIVO" && desdeCaja,
                referencia: medio === "TRANSFERENCIA" ? referencia : null,
              },
      });
      if (!r.ok) {
        setError(r.error);
        setErrores(r.campos ?? {});
        return;
      }
      try {
        localStorage.removeItem(clave);
      } catch {
        // nada que limpiar
      }
      router.push(`/proveedores/facturas/${r.id}?nueva=1`);
    } catch {
      setError("No pudimos guardar la factura. Revisa la conexión a internet e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  function descartar() {
    if (!window.confirm("¿Borrar este borrador de factura? No se guarda nada.")) return;
    setLineas([]);
    setNumero("");
    setNota("");
    setReferencia("");
    setVencimiento("");
    setErrores({});
    setError(null);
  }

  return (
    <>
      <form onSubmit={guardar} noValidate className="space-y-6 pb-28 lg:pb-0">
        <section className="grid gap-4 rounded-2xl border p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] md:p-6">
          <Campo id="proveedorId" etiqueta="Proveedor" error={errores.proveedorId}>
            <div className="flex gap-2">
              <NativeSelect
                id="proveedorId"
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                aria-invalid={!!errores.proveedorId}
                className="min-w-0"
              >
                <option value="">Elige el proveedor…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </NativeSelect>
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setDialogo("proveedor")}>
                <UserPlus /> <span className="hidden sm:inline">Nuevo</span>
              </Button>
            </div>
          </Campo>
          <Campo id="numero" etiqueta="Nº de factura" error={errores.numero}>
            <Input
              id="numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              maxLength={40}
              aria-invalid={!!errores.numero}
              placeholder="Ej.: FV-2045"
            />
          </Campo>
          <Campo id="fecha" etiqueta="Fecha de la factura" error={errores.fecha}>
            <Input id="fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value || hoy)} />
          </Campo>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Productos</h2>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTextoNuevo(buscador.current?.value ?? "");
                setDialogo("producto");
              }}
            >
              <PackagePlus /> Producto nuevo
            </Button>
          </div>
          <Buscador refInput={buscador} alElegir={agregar} alAvisar={setAviso} />
          {aviso && <p className="text-sm text-destructive">{aviso}</p>}

          {lineas.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-10 text-center text-muted-foreground">
              Escanea o busca los productos de la factura. Si alguno no existe, créalo con &quot;Producto nuevo&quot;.
            </div>
          ) : (
            <ul className="space-y-3">
              {calculadas.map(({ linea, calc }) => (
                <FilaLinea
                  key={linea.producto.id}
                  linea={linea}
                  calc={calc}
                  errores={errores}
                  onCambiar={(c) => cambiar(linea.producto.id, c)}
                  onQuitar={() => setLineas((ls) => ls.filter((l) => l.producto.id !== linea.producto.id))}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border p-4 md:p-6">
          <h2 className="font-semibold">Pago</h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pago">
            {(
              [
                ["contado", "Pagada de contado"],
                ["credito", "A crédito"],
              ] as const
            ).map(([t, nombre]) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                onClick={() => setTipo(t)}
                className={cn(
                  "h-12 rounded-lg border font-medium",
                  tipo === t ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
                )}
              >
                {nombre}
              </button>
            ))}
          </div>

          {tipo === "contado" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de pago">
                {(
                  [
                    ["EFECTIVO", "Efectivo", Banknote],
                    ["TRANSFERENCIA", "Transferencia", Landmark],
                  ] as const
                ).map(([m, nombre, Icono]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={medio === m}
                    onClick={() => setMedio(m)}
                    className={cn(
                      "flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium",
                      medio === m ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
                    )}
                  >
                    <Icono className="size-4" /> {nombre}
                  </button>
                ))}
              </div>
              {medio === "EFECTIVO" ? (
                <label className={cn("flex items-start gap-3 rounded-lg border p-3", !cajaAbierta && "opacity-60")}>
                  <input
                    type="checkbox"
                    className="mt-1 size-5 accent-primary"
                    checked={desdeCaja}
                    disabled={!cajaAbierta}
                    onChange={(e) => setDesdeCaja(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">El dinero sale de la caja de hoy</span>
                    <span className="block text-sm text-muted-foreground">
                      {cajaAbierta
                        ? "Se descuenta del efectivo esperado en el cierre. Desmárcalo si pagaste con plata que no estaba en la caja."
                        : "La caja de hoy no está abierta, así que este pago no se descuenta de ella."}
                    </span>
                  </span>
                </label>
              ) : (
                <Campo id="referencia" etiqueta="Referencia de la transferencia (opcional)">
                  <Input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} />
                </Campo>
              )}
            </div>
          ) : (
            <Campo
              id="vencimiento"
              etiqueta="Fecha de vencimiento"
              error={errores.vencimiento}
              ayuda="Por defecto, 30 días después de la factura."
            >
              <Input id="vencimiento" type="date" value={vence} min={fecha} onChange={(e) => setVencimiento(e.target.value)} />
            </Campo>
          )}

          <Campo id="nota" etiqueta="Nota (opcional)">
            <Textarea id="nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} />
          </Campo>
        </section>

        <AvisoError mensaje={error ?? undefined} />

        {/* En el celular el total y el botón quedan fijos abajo. */}
        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 lg:static lg:border-0 lg:bg-transparent lg:p-0">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">
                Total · {lineas.length} {lineas.length === 1 ? "producto" : "productos"}
              </p>
              <p className="text-2xl font-bold tabular-nums md:text-3xl" data-testid="total-factura">
                {formatearPesos(total)}
              </p>
            </div>
            {lineas.length > 0 && (
              <Button type="button" variant="ghost" className="hidden md:inline-flex" onClick={descartar}>
                Descartar
              </Button>
            )}
            <Button type="submit" size="lg" className="h-14 px-6 text-lg" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar factura"}
            </Button>
          </div>
        </div>
      </form>

      {/* Fuera del formulario de la factura: un formulario no puede ir dentro de otro. */}
      <Dialogo abierto={dialogo === "proveedor"} onCerrar={() => setDialogo(null)} titulo="Nuevo proveedor">
        <FormularioProveedorRapido
          onCreado={(p) => {
            setProveedores((ps) => [...ps, p].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
            setProveedorId(p.id);
            setDialogo(null);
          }}
        />
      </Dialogo>
      <Dialogo abierto={dialogo === "producto"} onCerrar={() => setDialogo(null)} titulo="Producto nuevo" className="max-w-lg">
        <FormularioProductoNuevo
          texto={textoNuevo}
          margen={margenNegocio}
          onCreado={(p) => {
            setDialogo(null);
            if (buscador.current) buscador.current.value = "";
            agregar(p);
          }}
        />
      </Dialogo>
    </>
  );
}

function FilaLinea({
  linea,
  calc,
  errores,
  onCambiar,
  onQuitar,
}: {
  linea: Linea;
  calc: ReturnType<typeof calcularLinea>;
  errores: Record<string, string>;
  onCambiar: (c: Partial<Linea>) => void;
  onQuitar: () => void;
}) {
  const p = linea.producto;
  const id = p.id;
  const corto = unidadCorta(p.unidad);
  const subio = linea.costo !== null && linea.costo > p.costo;
  return (
    <li className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{p.nombre}</p>
          <p className="text-sm text-muted-foreground">
            {p.codigo} · hay {formatearCantidad(p.stock)} {corto} · costo {formatearPesos(p.costo)} · precio{" "}
            {formatearPesos(p.precioVenta)}
            {calc.segunda && " · de segunda"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onQuitar} aria-label={`Quitar ${p.nombre}`}>
          <Trash2 className="size-5 text-muted-foreground" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo id={`cantidad-${id}`} etiqueta={`Cantidad (${corto})`} error={errores[`cantidad-${id}`]}>
          <Input
            id={`cantidad-${id}`}
            value={linea.cantidad}
            onChange={(e) => onCambiar({ cantidad: e.target.value })}
            inputMode={p.fraccionado ? "decimal" : "numeric"}
            autoComplete="off"
            aria-invalid={!!errores[`cantidad-${id}`]}
            className="text-lg tabular-nums"
          />
        </Campo>
        <Campo id={`costo-${id}`} etiqueta="Costo unitario (con IVA)" error={errores[`costo-${id}`]}>
          <CampoPesos
            id={`costo-${id}`}
            valor={linea.costo}
            onValor={(v) => onCambiar({ costo: v })}
            aria-invalid={!!errores[`costo-${id}`]}
            className="text-lg"
          />
        </Campo>
        <div className="col-span-2 flex items-end justify-between rounded-lg bg-muted/60 px-3 py-2 sm:col-span-1 sm:block">
          <p className="text-sm text-muted-foreground">Total línea</p>
          <p className="text-lg font-semibold tabular-nums">{formatearPesos(calc.total)}</p>
        </div>
      </div>

      {(calc.cambioCosto || calc.segunda) && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          {calc.cambioCosto && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {subio ? <TrendingUp className="size-4 text-destructive" /> : <TrendingDown className="size-4 text-emerald-600" />}
              <span>
                El costo {subio ? "subió" : "bajó"}: antes {formatearPesos(p.costo)}, ahora {formatearPesos(linea.costo ?? 0)}.
                {calc.promedio !== null && calc.promedio !== linea.costo && (
                  <> Con lo que ya tienes, el costo promedio queda en {formatearPesos(calc.promedio)}.</>
                )}
              </span>
            </p>
          )}
          {!calc.segunda && (
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={calc.actualizar}
                onChange={(e) => onCambiar({ actualizar: e.target.checked })}
              />
              <span className="font-medium">Actualizar precio de venta</span>
            </label>
          )}
          {calc.actualizar && (
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <Campo
                id={`precio-${id}`}
                etiqueta="Nuevo precio de venta"
                error={errores[`precio-${id}`]}
                ayuda={
                  calc.sugerido > 0 && (
                    <>
                      Sugerido con margen del {p.margen} %: {formatearPesos(calc.sugerido)}
                      {linea.precio !== null && linea.precio !== calc.sugerido && (
                        <button type="button" className="ml-2 underline" onClick={() => onCambiar({ precio: null })}>
                          Usar sugerido
                        </button>
                      )}
                    </>
                  )
                }
              >
                <CampoPesos
                  id={`precio-${id}`}
                  valor={calc.precio}
                  onValor={(v) => onCambiar({ precio: v ?? 0 })}
                  aria-invalid={!!errores[`precio-${id}`]}
                  className="text-lg"
                />
              </Campo>
              <p className="text-sm text-muted-foreground sm:pb-2">Precio actual: {formatearPesos(p.precioVenta)}</p>
            </div>
          )}
          {calc.segunda && (
            <label className={cn("flex items-start gap-3 rounded-lg p-2", errores[`confirmado-${id}`] && "bg-destructive/10")}>
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-primary"
                checked={linea.confirmado}
                onChange={(e) => onCambiar({ confirmado: e.target.checked })}
              />
              <span>
                <span className="font-medium">Confirmo el costo y el precio de venta</span>
                <span className="block text-sm text-muted-foreground">
                  Es un producto de segunda: cada compra puede tener otro costo.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </li>
  );
}

function Buscador({
  refInput,
  alElegir,
  alAvisar,
}: {
  refInput: React.RefObject<HTMLInputElement | null>;
  alElegir: (p: ProductoCompra) => void;
  alAvisar: (mensaje: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<ProductoCompra[]>([]);
  const [buscado, setBuscado] = useState("");
  const [indice, setIndice] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const pedido = useRef(0);

  const buscar = useCallback(async (q: string) => {
    const n = ++pedido.current;
    const r = await buscarProductoFactura(q);
    return n === pedido.current ? r : null;
  }, []);

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

  const elegir = (p: ProductoCompra) => {
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
    } else if (e.key === "Escape" && texto) {
      e.preventDefault();
      setTexto("");
      setAbierto(false);
    } else if (e.key === "Enter") {
      // Enter aquí nunca guarda la factura: el lector de códigos manda Enter después de cada código.
      e.preventDefault();
      const q = texto.trim();
      if (!q) return;
      if (q === buscado && resultados.length) return elegir(resultados[Math.min(indice, resultados.length - 1)]);
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
        alAvisar(`No encontramos "${q}". Búscalo por nombre o créalo con "Producto nuevo".`);
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
        enterKeyHint="search"
        role="combobox"
        aria-expanded={!!mostrar}
        aria-controls="resultados-factura"
        aria-label="Buscar producto"
        className="h-14 w-full rounded-xl border-2 border-primary/70 bg-background pr-4 pl-12 text-lg outline-none focus:border-primary focus:ring-4 focus:ring-ring/20"
      />
      {mostrar && (
        <ul
          id="resultados-factura"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
        >
          {resultados.length === 0 ? (
            <li className="px-4 py-3 text-muted-foreground">No encontramos productos con &quot;{buscado}&quot;.</li>
          ) : (
            resultados.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === indice}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(p)}
                  onMouseEnter={() => setIndice(i)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left", i === indice && "bg-accent")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.nombre}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {p.codigo} · hay {formatearCantidad(p.stock)} {unidadCorta(p.unidad)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground tabular-nums">Costo {formatearPesos(p.costo)}</p>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function FormularioProveedorRapido({ onCreado }: { onCreado: (p: Proveedor) => void }) {
  const [nombre, setNombre] = useState("");
  const [nit, setNit] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string>();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEnviando(true);
    try {
      const r = await crearProveedorRapido({ nombre, nit, telefono });
      if (r.ok) onCreado({ id: r.id, nombre: nombre.trim() });
      else {
        setError(r.error);
        setCampos(r.campos ?? {});
      }
    } catch {
      setError("No pudimos crear el proveedor. Revisa la conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={crear} className="space-y-4" noValidate>
      <Campo id="prov-nombre" etiqueta="Nombre o razón social" error={campos.nombre}>
        <Input id="prov-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="prov-nit" etiqueta="NIT (opcional)" error={campos.nit}>
          <Input id="prov-nit" value={nit} onChange={(e) => setNit(e.target.value)} maxLength={30} />
        </Campo>
        <Campo id="prov-tel" etiqueta="Teléfono (opcional)" error={campos.telefono}>
          <Input id="prov-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={40} />
        </Campo>
      </div>
      <AvisoError mensaje={error} />
      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        <Plus /> {enviando ? "Creando…" : "Crear proveedor"}
      </Button>
    </form>
  );
}

function FormularioProductoNuevo({
  texto,
  margen,
  onCreado,
}: {
  texto: string;
  margen: number;
  onCreado: (p: ProductoCompra) => void;
}) {
  // Lo que se había escrito en el buscador: si son solo números parece un código de barras; si no, un nombre.
  const pareceCodigo = /^\d{6,}$/.test(texto.trim());
  const [nombre, setNombre] = useState(pareceCodigo ? "" : texto.trim());
  const [codigo, setCodigo] = useState("");
  const [codigoBarras, setCodigoBarras] = useState(pareceCodigo ? texto.trim() : "");
  const [unidad, setUnidad] = useState<UnidadMedida>("UNIDAD");
  const [fraccionado, setFraccionado] = useState(false);
  const [iva, setIva] = useState("19");
  const [condicion, setCondicion] = useState<"NUEVO" | "DE_SEGUNDA">("NUEVO");
  const [costo, setCosto] = useState<number | null>(null);
  const [precio, setPrecio] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const sugerido = costo ? precioSugerido(costo, margen) : 0;
  const precioFinal = precio ?? (sugerido || null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEnviando(true);
    try {
      const r = await crearProductoFactura({
        nombre,
        codigo: codigo.trim() || codigoBarras.trim(),
        codigoBarras,
        unidad,
        fraccionado: unidad !== "UNIDAD" && fraccionado,
        porcentajeIva: iva,
        condicion,
        costo: costo ?? "",
        precioVenta: precioFinal ?? "",
      });
      if (r.ok && r.producto) onCreado(r.producto);
      else if (!r.ok) {
        setError(r.error);
        setCampos(r.campos ?? {});
      }
    } catch {
      setError("No pudimos crear el producto. Revisa la conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={crear} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">Se crea en el inventario con stock 0 y entra con esta factura.</p>
      <Campo id="pn-nombre" etiqueta="Nombre" error={campos.nombre}>
        <Input id="pn-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          id="pn-codigo"
          etiqueta="Código"
          error={campos.codigo}
          ayuda={!codigo && codigoBarras ? "Si lo dejas vacío, se usa el de barras." : undefined}
        >
          <Input id="pn-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={50} />
        </Campo>
        <Campo id="pn-barras" etiqueta="Código de barras" error={campos.codigoBarras}>
          <Input id="pn-barras" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} maxLength={60} />
        </Campo>
        <Campo id="pn-unidad" etiqueta="Se vende por" error={campos.unidad}>
          <NativeSelect id="pn-unidad" value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadMedida)}>
            {Object.entries(UNIDADES).map(([k, u]) => (
              <option key={k} value={k}>
                {u.nombre}
              </option>
            ))}
          </NativeSelect>
        </Campo>
        <Campo id="pn-iva" etiqueta="IVA" error={campos.porcentajeIva}>
          <NativeSelect id="pn-iva" value={iva} onChange={(e) => setIva(e.target.value)}>
            {IVAS.map((v) => (
              <option key={v} value={v}>
                {v} %
              </option>
            ))}
          </NativeSelect>
        </Campo>
      </div>
      {unidad !== "UNIDAD" && (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={fraccionado}
            onChange={(e) => setFraccionado(e.target.checked)}
          />
          <span>Se vende fraccionado (ej.: 2,5 {UNIDADES[unidad].corto})</span>
        </label>
      )}
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={condicion === "DE_SEGUNDA"}
          onChange={(e) => setCondicion(e.target.checked ? "DE_SEGUNDA" : "NUEVO")}
        />
        <span>Es de segunda</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="pn-costo" etiqueta="Costo (con IVA)" error={campos.costo}>
          <CampoPesos id="pn-costo" valor={costo} onValor={setCosto} />
        </Campo>
        <Campo
          id="pn-precio"
          etiqueta="Precio de venta"
          error={campos.precioVenta}
          ayuda={sugerido > 0 ? `Sugerido con ${margen} %: ${formatearPesos(sugerido)}` : undefined}
        >
          <CampoPesos id="pn-precio" valor={precioFinal} onValor={setPrecio} />
        </Campo>
      </div>
      <AvisoError mensaje={error} />
      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        <PackagePlus /> {enviando ? "Creando…" : "Crear y agregar a la factura"}
      </Button>
    </form>
  );
}
