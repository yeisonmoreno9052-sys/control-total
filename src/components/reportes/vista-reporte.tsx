import type { Reporte } from "@/lib/reportes/armar";
import { cn } from "@/lib/utils";
import { formatearCelda } from "./formato";
import { GraficaBarras } from "./grafica-barras";

/** Tarjetas, gráfica y tablas de un reporte. La usan la pantalla y la versión para imprimir. */
export function VistaReporte({ reporte, impresion = false }: { reporte: Reporte; impresion?: boolean }) {
  return (
    <div className={cn("space-y-6", impresion && "space-y-4")}>
      <div className={cn("grid gap-3", impresion ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-3")}>
        {reporte.tarjetas.map((t) => (
          <div
            key={t.etiqueta}
            className={cn(
              "rounded-2xl border p-4 md:p-5",
              t.destacada && "col-span-2 border-primary/30 bg-accent/40 lg:col-span-1",
              impresion && "col-span-1 rounded-lg p-3",
            )}
          >
            <p className="text-sm text-muted-foreground">{t.etiqueta}</p>
            <p
              className={cn(
                "font-bold tracking-tight tabular-nums",
                t.destacada ? "text-3xl" : "text-2xl",
                t.tipo === "pesos" && t.valor < 0 && "text-destructive",
                impresion && "text-xl",
              )}
            >
              {formatearCelda(t.valor, t.tipo)}
            </p>
            {t.ayuda && <p className="mt-0.5 text-xs text-muted-foreground">{t.ayuda}</p>}
          </div>
        ))}
      </div>

      {reporte.grafica && (
        <section className="rounded-2xl border p-4 md:p-5">
          <h2 className="mb-3 font-semibold">Ventas por día</h2>
          <GraficaBarras datos={reporte.grafica} />
        </section>
      )}

      {reporte.tablas.map((t) => (
        <section key={t.titulo} className="space-y-2 break-inside-avoid">
          <h2 className="font-semibold">{t.titulo}</h2>
          {t.filas.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {t.vacia ?? "Sin datos."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    {t.columnas.map((c) => (
                      <th
                        key={c.titulo}
                        scope="col"
                        className={cn("px-3 py-2.5 font-medium whitespace-nowrap", c.tipo !== "texto" && "text-right")}
                      >
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {t.filas.map((f, i) => (
                    <tr key={i}>
                      {f.map((celda, j) => (
                        <td
                          key={j}
                          className={cn(
                            "px-3 py-2",
                            t.columnas[j].tipo !== "texto" ? "text-right whitespace-nowrap tabular-nums" : "min-w-32",
                            typeof celda === "number" && celda < 0 && "text-muted-foreground",
                          )}
                        >
                          {formatearCelda(celda, t.columnas[j].tipo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {t.total && (
                  <tfoot className="border-t-2 font-semibold">
                    <tr>
                      {t.total.map((celda, j) => (
                        <td key={j} className={cn("px-3 py-2.5", t.columnas[j].tipo !== "texto" && "text-right tabular-nums")}>
                          {formatearCelda(celda, t.columnas[j].tipo)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      ))}

      {reporte.nota && <p className="text-sm text-muted-foreground">{reporte.nota}</p>}
    </div>
  );
}
