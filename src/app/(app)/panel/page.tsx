import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Package, Receipt, Store, TriangleAlert } from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { GraficaBarras } from "@/components/reportes/grafica-barras";
import { SelectorNegocioReporte } from "@/components/reportes/selector-negocio-reporte";
import { Button } from "@/components/ui/button";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { contarProductos } from "@/lib/datos/productos";
import { facturasPorVencer, resumenVentas, stockBajo, utilidadDelPeriodo, ventasPorDia } from "@/lib/datos/reportes";
import { formatearFecha, formatearPesos } from "@/lib/formato";
import { tieneModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { negociosParaReporte } from "@/lib/reportes/armar";
import { calcularPeriodo, periodoAnterior, sumarDias, variacion, type Periodo } from "@/lib/reportes/periodos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio · Control Total" };

export default async function Panel({ searchParams }: PageProps<"/panel">) {
  const ctx = await obtenerContexto();
  // El cajero no ve cifras del negocio: su inicio es la caja.
  if (!puedeGestionar(ctx)) {
    if (tieneModulo(ctx, "VENTAS") && ctx.negocioActivoId) redirect("/ventas");
    return <InicioSencillo nombre={ctx.nombre} />;
  }
  if (!ctx.negocioActivoId) {
    return (
      <EstadoVacio
        icono={Store}
        titulo="Aún no tienes un negocio asignado"
        descripcion="Pídele al administrador que te dé acceso a un negocio para empezar a trabajar."
      />
    );
  }

  const negocios = await negociosParaReporte(ctx, ctx.negocioActivoId, await searchParams).catch((error) => {
    if (error instanceof AccesoDenegado) return null;
    throw error;
  });
  if (!negocios) return <SinPermiso />;
  const ids = negocios.ids;
  const primerNombre = ctx.nombre.split(" ")[0];
  const conVentas = tieneModulo(ctx, "VENTAS");

  const hoy = calcularPeriodo("hoy");
  const semana = calcularPeriodo("semana");
  const mes = calcularPeriodo("mes");
  const ventas = (p: Periodo) => resumenVentas(ctx, ids, p.desde, p.hasta).then((r) => r.totalVendido);
  const [vHoy, vAyer, vSemana, vSemanaAnterior, vMes, vMesAnterior, utilidadMes, dias, bajos, porVencer, productos] =
    await Promise.all([
      ventas(hoy),
      ventas(periodoAnterior(hoy)),
      ventas(semana),
      ventas(periodoAnterior(semana)),
      ventas(mes),
      ventas(periodoAnterior(mes)),
      utilidadDelPeriodo(ctx, ids, mes.desde, mes.hasta),
      ventasPorDia(ctx, ids, sumarDias(hoy.hasta, -29), hoy.hasta),
      tieneModulo(ctx, "INVENTARIO") ? stockBajo(ctx, ids) : 0,
      tieneModulo(ctx, "PROVEEDORES") ? facturasPorVencer(ctx, ids, 7) : null,
      tieneModulo(ctx, "INVENTARIO")
        ? Promise.all(ids.map((id) => contarProductos(ctx, id))).then((n) => n.reduce((a, b) => a + b, 0))
        : 0,
    ]);
  const unSoloNegocio = ids.length === 1 && ids[0] === ctx.negocioActivoId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{formatearFecha(new Date())}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola, {primerNombre}</h1>
          <p className="text-muted-foreground">{negocios.nombre}</p>
        </div>
        <SelectorNegocioReporte opciones={negocios.opciones} valor={negocios.valor} />
      </div>

      {tieneModulo(ctx, "INVENTARIO") && productos === 0 && unSoloNegocio ? (
        <EstadoVacio
          icono={Package}
          titulo="Todavía no hay productos"
          descripcion={`Agrega o importa los productos de ${negocios.nombre} para empezar a vender.`}
          accion={
            <Button asChild variant="outline">
              <Link href="/inventario/importar">Importar productos</Link>
            </Button>
          }
        />
      ) : null}

      {(bajos > 0 || (porVencer && porVencer.facturas > 0)) && (
        <div className="grid gap-3 md:grid-cols-2">
          {bajos > 0 && (
            <Aviso
              href={unSoloNegocio ? "/inventario?bajo=1" : "/inventario"}
              titulo={`${bajos.toLocaleString("es-CO")} ${bajos === 1 ? "producto está" : "productos están"} con stock bajo`}
              detalle={unSoloNegocio ? "Toca para ver cuáles." : "Revisa el inventario de cada negocio."}
            />
          )}
          {porVencer && porVencer.facturas > 0 && (
            <Aviso
              href="/proveedores/por-pagar"
              rojo={porVencer.vencidas > 0}
              titulo={
                porVencer.vencidas > 0
                  ? `${porVencer.vencidas} ${porVencer.vencidas === 1 ? "factura vencida" : "facturas vencidas"} con proveedores`
                  : `${porVencer.facturas} ${porVencer.facturas === 1 ? "factura vence" : "facturas vencen"} esta semana`
              }
              detalle={`Saldo por pagar: ${formatearPesos(porVencer.saldo)}.`}
            />
          )}
        </div>
      )}

      {conVentas && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Cifra titulo="Ventas de hoy" valor={vHoy} anterior={vAyer} contra="ayer" destacado />
            <Cifra titulo="Esta semana" valor={vSemana} anterior={vSemanaAnterior} contra="la semana pasada" />
            <Cifra titulo="Este mes" valor={vMes} anterior={vMesAnterior} contra="el mes pasado" />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
            <Link href="/reportes?vista=utilidad" className="rounded-2xl border p-5 hover:bg-muted/40">
              <p className="text-sm text-muted-foreground">Utilidad del mes</p>
              <p className={cn("text-3xl font-bold tabular-nums", utilidadMes.utilidadNeta < 0 && "text-destructive")}>
                {formatearPesos(utilidadMes.utilidadNeta)}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Utilidad bruta</dt>
                  <dd className="tabular-nums">{formatearPesos(utilidadMes.ventas.utilidadBruta)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Gastos</dt>
                  <dd className="tabular-nums">− {formatearPesos(utilidadMes.gastos.gastos)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ventas</dt>
                  <dd className="tabular-nums">{utilidadMes.ventas.ventas.toLocaleString("es-CO")}</dd>
                </div>
              </dl>
              <p className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
                Ver reporte <ChevronRight className="size-4" />
              </p>
            </Link>
            <section className="rounded-2xl border p-5">
              <h2 className="mb-3 font-semibold">Ventas de los últimos 30 días</h2>
              {dias.some((d) => d.total) ? (
                <GraficaBarras datos={dias.map((d) => ({ dia: d.dia, total: d.total }))} />
              ) : (
                <div className="flex h-44 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <Receipt className="size-6" />
                  Todavía no hay ventas en estos días.
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Cifra({
  titulo,
  valor,
  anterior,
  contra,
  destacado = false,
}: {
  titulo: string;
  valor: number;
  anterior: number;
  contra: string;
  destacado?: boolean;
}) {
  const cambio = variacion(valor, anterior);
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        destacado &&
          "border-transparent bg-gradient-to-br from-destacado-desde to-destacado-hasta text-white shadow-lg shadow-indigo-500/20",
      )}
    >
      <p className={cn("text-sm", destacado ? "text-white/80" : "text-muted-foreground")}>{titulo}</p>
      <p className="text-3xl font-bold tracking-tight tabular-nums">{formatearPesos(valor)}</p>
      <p className={cn("mt-1 flex items-center gap-1 text-sm", destacado ? "text-white/80" : "text-muted-foreground")}>
        {cambio === null ? (
          `Sin ventas para comparar con ${contra}`
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center font-medium",
                destacado
                  ? "rounded-full bg-white/15 px-1.5 text-white"
                  : cambio >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-destructive",
              )}
            >
              {cambio >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
              {Math.abs(cambio).toLocaleString("es-CO")} %
            </span>
            frente a {contra}
          </>
        )}
      </p>
    </div>
  );
}

function Aviso({ href, titulo, detalle, rojo = false }: { href: string; titulo: string; detalle: string; rojo?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-4 rounded-xl border p-4",
        rojo
          ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
          : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60",
      )}
    >
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          rojo ? "bg-destructive/15 text-destructive" : "bg-amber-200 dark:bg-amber-900",
        )}
      >
        <TriangleAlert className="size-6" />
      </div>
      <div className="flex-1">
        <p className="font-semibold">{titulo}</p>
        <p className="text-sm opacity-80">{detalle}</p>
      </div>
      <ChevronRight className="size-5 opacity-60" />
    </Link>
  );
}

function InicioSencillo({ nombre }: { nombre: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{formatearFecha(new Date())}</p>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola, {nombre.split(" ")[0]}</h1>
    </div>
  );
}
