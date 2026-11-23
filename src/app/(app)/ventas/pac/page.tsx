import type { Metadata } from "next";
import Link from "next/link";
import { Download, Smartphone } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SelectorPeriodo } from "@/components/reportes/selector-periodo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listarOperacionesPac, NOMBRE_OPERACION_PAC, negocioUsaPac, totalesPac } from "@/lib/datos/pac";
import { formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { describirPeriodo, periodoDeParametros } from "@/lib/reportes/periodos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { BotonAnularPac } from "./anular";
import { FormularioPac } from "./formulario";

export const metadata: Metadata = { title: "PAC · Control Total" };

export default async function Pac({ searchParams }: PageProps<"/ventas/pac">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  const negocioId = ctx.negocioActivoId;
  const gestiona = puedeGestionar(ctx);
  if (!negocioId || !(await negocioUsaPac(ctx, negocioId))) {
    return (
      <EstadoVacio
        icono={Smartphone}
        titulo="El PAC no está activado en este negocio"
        descripcion={
          gestiona
            ? "Actívalo en Configuración → Cómo vende el negocio → Usar PAC."
            : "Pídele al administrador que lo active en Configuración."
        }
        accion={
          gestiona ? (
            <Button asChild variant="outline">
              <Link href="/configuracion">Ir a Configuración</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const parametros = await searchParams;
  const periodo = periodoDeParametros(parametros, "hoy");
  const operaciones = await listarOperacionesPac(ctx, negocioId, periodo.desde, periodo.hasta);
  const t = totalesPac(operaciones);
  const soloHoy = !gestiona || (periodo.desde === periodo.hasta && periodo.preset === "hoy");
  const variosDias = periodo.desde !== periodo.hasta;

  return (
    <div>
      <EncabezadoPagina
        titulo="PAC"
        volver={{ href: "/ventas", texto: "Volver a la caja" }}
        subtitulo="Recargas y retiros. No se mezclan con las ventas de la tienda."
        acciones={
          gestiona && operaciones.length > 0 ? (
            <Button asChild variant="outline">
              <a href={`/api/pac/excel?periodo=${periodo.preset}&desde=${periodo.desde}&hasta=${periodo.hasta}`}>
                <Download /> Excel
              </a>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <FormularioPac />

        <section className="min-w-0 space-y-4">
          {gestiona && (
            <div>
              <SelectorPeriodo periodo={periodo} />
              <p className="mt-2 text-sm text-muted-foreground">{describirPeriodo(periodo)}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white shadow-suave">
              <p className="text-sm opacity-90">Plata movida</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl">{formatearPesos(t.movido)}</p>
              <p className="text-xs opacity-85">
                {t.operaciones} {t.operaciones === 1 ? "operación" : "operaciones"}
                {soloHoy ? " hoy" : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 p-4 text-white shadow-suave">
              <p className="text-sm opacity-90">Comisiones ganadas</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl">{formatearPesos(t.comisiones)}</p>
              <p className="text-xs opacity-85">Esto es lo que gana el local</p>
            </div>
          </div>
          {t.operaciones > 0 && (
            <p className="text-sm text-muted-foreground">
              Recargas {formatearPesos(t.recargas)} · Retiros {formatearPesos(t.retiros)} · En el cajón{" "}
              {t.efectivoNeto < 0 ? "salieron" : "entraron"} {formatearPesos(Math.abs(t.efectivoNeto))}
            </p>
          )}

          {operaciones.length === 0 ? (
            <EstadoVacio
              icono={Smartphone}
              titulo={soloHoy ? "Hoy no hay recargas ni retiros" : "No hay operaciones en estas fechas"}
              descripcion="Anota cada recarga o retiro con el formulario y aquí verás lo que lleva ganado."
            />
          ) : (
            <ul className="divide-y rounded-2xl border bg-card px-4 shadow-suave">
              {operaciones.map((o) => (
                <li key={o.id} className={cn("flex items-center justify-between gap-3 py-3", o.anulado && "opacity-50")}>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className={cn(o.anulado && "line-through")}>{NOMBRE_OPERACION_PAC[o.tipo]}</span>
                      {o.anulado && (
                        <Badge variant="destructive" className="ml-2 align-middle">
                          Anulada
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {variosDias && `${formatearFecha(o.fecha)} · `}
                      {formatearHora(o.creadoEn)} ·{" "}
                      {o.tipo === "RETIRO" ? "Se entregó efectivo" : o.medio === "EFECTIVO" ? "Efectivo" : "Transferencia"}
                      {o.usuario && ` · ${o.usuario}`}
                      {o.anulado ? ` · ${o.motivoAnulacion ?? ""}` : o.nota ? ` · ${o.nota}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <div className="text-right tabular-nums">
                      <p className={cn("font-bold", o.anulado && "line-through")}>{formatearPesos(o.valor)}</p>
                      <p className="text-sm font-semibold text-emerald-600">+ {formatearPesos(o.comision)}</p>
                    </div>
                    {o.anulable && (
                      <BotonAnularPac
                        id={o.id}
                        descripcion={`${NOMBRE_OPERACION_PAC[o.tipo]} de ${formatearPesos(o.valor)}`}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            En el cierre de caja el PAC sale en un renglón aparte. No cuenta como venta ni en la utilidad del negocio.
          </p>
        </section>
      </div>
    </div>
  );
}
