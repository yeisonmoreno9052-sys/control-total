import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { SelectorPeriodo } from "@/components/reportes/selector-periodo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORIAS_CAJA, listarMovimientosCaja } from "@/lib/datos/movimientos-caja";
import { formatearDia, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { describirPeriodo, periodoDeParametros } from "@/lib/reportes/periodos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { BotonAnularMovimiento } from "./anular";

export const metadata: Metadata = { title: "Caja · Control Total" };

export default async function Caja({ searchParams }: PageProps<"/caja">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "CAJA");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const parametros = await searchParams;
  const periodo = periodoDeParametros(parametros, "mes");
  const movimientos = await listarMovimientosCaja(ctx, [ctx.negocioActivoId], periodo.desde, periodo.hasta);
  const vigentes = movimientos.filter((m) => !m.anulado);
  const suma = (filtro: (m: (typeof vigentes)[number]) => boolean) => vigentes.filter(filtro).reduce((a, m) => a + m.valor, 0);
  const egresos = suma((m) => m.tipo === "EGRESO");
  const ingresos = suma((m) => m.tipo === "INGRESO");
  const porCategoria = new Map<string, number>();
  for (const m of vigentes.filter((x) => x.tipo === "EGRESO"))
    porCategoria.set(m.categoria, (porCategoria.get(m.categoria) ?? 0) + m.valor);
  const registrado = parametros.registrado;

  return (
    <div>
      <EncabezadoPagina
        titulo="Caja"
        subtitulo="Ingresos y egresos que no son ventas."
        acciones={
          <>
            <Button asChild variant="outline">
              <Link href="/ventas/caja">
                <Wallet /> Cierres de caja
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/caja/nuevo?tipo=ingreso">
                <ArrowDownLeft /> Ingreso
              </Link>
            </Button>
            <Button asChild>
              <Link href="/caja/nuevo?tipo=egreso">
                <ArrowUpRight /> Egreso
              </Link>
            </Button>
          </>
        }
      />

      {(registrado === "egreso" || registrado === "ingreso") && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
        >
          <CheckCircle2 className="size-5" /> {registrado === "egreso" ? "Egreso registrado." : "Ingreso registrado."}
        </p>
      )}

      <div className="mb-6">
        <SelectorPeriodo periodo={periodo} />
        <p className="mt-2 text-sm text-muted-foreground">{describirPeriodo(periodo)}</p>
      </div>

      {movimientos.length === 0 ? (
        <EstadoVacio
          icono={Wallet}
          titulo="No hay ingresos ni egresos en estas fechas"
          descripcion="Registra aquí la nómina, el arriendo, los servicios o los retiros, para que el cierre de caja y la utilidad cuadren."
          accion={
            <Button asChild>
              <Link href="/caja/nuevo?tipo=egreso">Registrar egreso</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border p-5">
              <p className="text-sm text-muted-foreground">Egresos</p>
              <p className="text-3xl font-bold tabular-nums" data-testid="total-egresos">
                {formatearPesos(egresos)}
              </p>
              {porCategoria.size > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {[...porCategoria]
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, v]) => (
                      <li key={c} className="flex justify-between">
                        <span className="text-muted-foreground">{CATEGORIAS_CAJA[c as keyof typeof CATEGORIAS_CAJA].nombre}</span>
                        <span className="tabular-nums">{formatearPesos(v)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border p-5">
              <p className="text-sm text-muted-foreground">Ingresos</p>
              <p className="text-3xl font-bold tabular-nums">{formatearPesos(ingresos)}</p>
            </div>
          </div>

          <ul className="divide-y rounded-xl border">
            {movimientos.map((m) => {
              const cat = CATEGORIAS_CAJA[m.categoria];
              const egreso = m.tipo === "EGRESO";
              return (
                <li key={m.id} className={cn("flex items-start gap-3 p-4", m.anulado && "opacity-60")}>
                  <div
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                      egreso
                        ? "bg-muted text-foreground"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                    )}
                  >
                    {egreso ? <ArrowUpRight className="size-4" /> : <ArrowDownLeft className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {cat.nombre}
                      {m.pagadoA && <span className="font-normal text-muted-foreground"> · {m.pagadoA}</span>}
                      {m.anulado && (
                        <Badge variant="destructive" className="ml-2">
                          Anulado
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatearDia(m.fecha)} ·{" "}
                      {m.medio === "EFECTIVO" ? (m.desdeCaja ? "Efectivo de la caja" : "Efectivo") : "Transferencia"} ·{" "}
                      {m.usuario}
                    </p>
                    {m.nota && <p className="text-sm">{m.nota}</p>}
                    {m.anulado && m.motivoAnulacion && <p className="text-sm text-destructive">Motivo: {m.motivoAnulacion}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className={cn("font-semibold tabular-nums", m.anulado && "line-through")}>
                      {egreso ? "− " : "+ "}
                      {formatearPesos(m.valor)}
                    </p>
                    {!m.anulado && (
                      <BotonAnularMovimiento
                        id={m.id}
                        descripcion={`${cat.nombre} por ${formatearPesos(m.valor)} del ${formatearDia(m.fecha)}`}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
