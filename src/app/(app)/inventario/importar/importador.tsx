"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { AvisoError } from "@/components/layout/campo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { importarAccion, type EstadoImportacion } from "../acciones";

export function Importador() {
  const [estado, accion, procesando] = useActionState<EstadoImportacion, FormData>(importarAccion, {});
  const [archivo, setArchivo] = useState<File | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const a = estado.analisis;

  // El mismo archivo se manda dos veces: primero para la vista previa y luego para guardar.
  function enviar(confirmar: boolean) {
    if (!archivo) return;
    const datos = new FormData();
    datos.set("archivo", archivo);
    if (confirmar) datos.set("confirmar", "1");
    setConfirmando(confirmar);
    startTransition(() => accion(datos));
  }

  if (estado.importado && a) {
    return (
      <div className="space-y-4 rounded-xl border p-6 text-center">
        <CircleCheck className="mx-auto size-12 text-emerald-600" />
        <h2 className="text-xl font-semibold">Importación lista</h2>
        <p className="text-muted-foreground">
          {a.nuevos.toLocaleString("es-CO")} productos nuevos y {a.actualizados.toLocaleString("es-CO")} actualizados
          {a.categoriasNuevas.length ? `, ${a.categoriasNuevas.length} categorías nuevas` : ""}.
        </p>
        <Button asChild size="lg">
          <Link href="/inventario">Ver inventario</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-4">
        <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <p className="font-medium">1. Descarga la plantilla</p>
            <p className="text-sm text-muted-foreground">Trae las columnas, un ejemplo y las instrucciones.</p>
          </div>
          <Button asChild variant="outline">
            <a href="/inventario/importar/plantilla" download>
              <Download /> Plantilla de Excel
            </a>
          </Button>
        </li>
        <li className="space-y-3 rounded-xl border p-4">
          <p className="font-medium">2. Sube tu archivo</p>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx,.csv,.txt"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setArchivo(f);
              e.target.value = "";
              if (f) {
                const datos = new FormData();
                datos.set("archivo", f);
                setConfirmando(false);
                startTransition(() => accion(datos));
              }
            }}
          />
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:bg-muted/50"
          >
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <span className="font-medium">{archivo ? archivo.name : "Elegir archivo .xlsx o .csv"}</span>
            <span className="text-sm text-muted-foreground">
              {archivo ? "Toca para cambiarlo" : "Hasta 15 MB · se revisa antes de guardar"}
            </span>
          </button>
        </li>
      </ol>

      {procesando && (
        <p className="text-center text-muted-foreground" role="status">
          {confirmando ? "Guardando productos… no cierres esta página." : "Revisando el archivo…"}
        </p>
      )}
      <AvisoError mensaje={estado.error ?? (a && !a.total ? a.error : undefined)} />

      {a && a.total > 0 && !procesando && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">3. Revisa antes de guardar</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Resumen titulo="Nuevos" valor={a.nuevos} />
            <Resumen titulo="Se actualizan" valor={a.actualizados} />
            <Resumen titulo="Con errores" valor={a.errores.length} alerta={a.errores.length > 0} />
          </div>
          {a.categoriasNuevas.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Se crearán {a.categoriasNuevas.length} categorías: {a.categoriasNuevas.slice(0, 10).join(", ")}
              {a.categoriasNuevas.length > 10 ? "…" : ""}
            </p>
          )}

          {a.errores.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-destructive/40 p-4">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <TriangleAlert className="size-5" /> Corrige estas filas en tu archivo y vuelve a subirlo. No se guardó nada.
              </p>
              {a.error && <p className="text-sm text-muted-foreground">{a.error}</p>}
              <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
                {a.errores.map((e) => (
                  <li key={`${e.fila}-${e.mensaje}`}>
                    <strong>Fila {e.fila}:</strong> {e.mensaje}
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={() => entrada.current?.click()}>
                <Upload /> Subir el archivo corregido
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Fila</th>
                      <th className="px-3 py-2 font-medium">Producto</th>
                      <th className="px-3 py-2 text-right font-medium">Precio</th>
                      <th className="px-3 py-2 text-right font-medium">Stock</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {a.muestra.map((m) => (
                      <tr key={m.fila}>
                        <td className="px-3 py-2 text-muted-foreground">{m.fila}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{m.nombre}</span>
                          <span className="block text-muted-foreground">{m.codigo}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.precioVenta ? formatearPesos(m.precioVenta) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.stock ? formatearCantidad(m.stock) : "sin cambio"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={m.accion === "nuevo" ? "default" : "secondary"}>{m.accion === "nuevo" ? "Nuevo" : "Actualiza"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {a.total > a.muestra.length && (
                  <p className="border-t px-3 py-2 text-sm text-muted-foreground">
                    Y {(a.total - a.muestra.length).toLocaleString("es-CO")} productos más.
                  </p>
                )}
              </div>
              <Button size="lg" className="w-full" onClick={() => enviar(true)} disabled={procesando}>
                Guardar {(a.nuevos + a.actualizados).toLocaleString("es-CO")} productos
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Resumen({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${alerta ? "text-destructive" : ""}`}>{valor.toLocaleString("es-CO")}</p>
    </div>
  );
}
