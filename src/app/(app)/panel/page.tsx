import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  Package,
  Receipt,
  Store,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { GraficaBarras } from "@/components/reportes/grafica-barras";
import { SelectorNegocioReporte } from "@/components/reportes/selector-negocio-reporte";
import { Button } from "@/components/ui/button";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { contarProductos } from "@/lib/datos/productos";
import {
  facturasPorVencer,
  productosVendidos,
  resumenVentas,
  stockBajo,
  utilidadDelPeriodo,
  ventasPorDia,
} from "@/lib/datos/reportes";
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
  const [vHoy, vAyer, vSemana, vSemanaAnterior, vMes, vMesAnterior, utilidadMes, dias, bajos, porVencer, productos, masVendidos] =
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
      conVentas ? productosVendidos(ctx, ids, semana.desde, semana.hasta, "total", "mas", 5) : [],
    ]);
  const unSoloNegocio = ids.length === 1 && ids[0] === ctx.negocioActivoId;

  return (
    <div className="space-y-4">
      {/* Franja de color con el saludo; las cifras se montan encima. */}
      <div className="-mx-4 -mt-6 bg-franja px-4 pt-6 pb-20 text-white md:mx-0 md:mt-0 md:rounded-3xl md:px-8 md:pt-8 md:pb-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-white/75">{fechaLarga()}</p>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Hola, {primerNombre} 👋</h1>
            <p className="text-white/75">{negocios.nombre}</p>
          </div>
          <div className="[&_select]:border-white/20 [&_select]:bg-white/10 [&_select]:text-white [&_option]:text-foreground [&_svg]:text-white/80">
            <SelectorNegocioReporte opciones={negocios.opciones} valor={negocios.valor} />
          </div>
        </div>
      </div>

      <div className="relative -mt-20 space-y-4 md:-mt-24 md:px-4">
        {conVentas && (
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Cifra titulo="Ventas de hoy" icono={Banknote} valor={vHoy} anterior={vAyer} contra="ayer" destacado />
            <Cifra
              titulo="Esta semana"
              icono={TrendingUp}
              color="verde"
              valor={vSemana}
              anterior={vSemanaAnterior}
              contra="la semana pasada"
            />
            <Cifra
              titulo="Este mes"
              icono={CalendarDays}
              color="azul"
              valor={vMes}
              anterior={vMesAnterior}
              contra="el mes pasado"
            />
            <Link
              href="/reportes?vista=utilidad"
              className="col-span-2 rounded-2xl bg-card p-4 lg:col-span-1 shadow-suave transition-transform hover:-translate-y-0.5 md:p-5"
            >
              <p className="flex items-center gap-2.5 text-sm font-semibold text-muted-foreground">
                <Insignia color="violeta">
                  <ChartColumn className="size-4" />
                </Insignia>
                Utilidad del mes
              </p>
              <p
                className={cn(
                  "mt-3 text-2xl font-extrabold tracking-tight tabular-nums md:text-[28px]",
                  utilidadMes.utilidadNeta < 0 && "text-destructive",
                )}
              >
                {formatearPesos(utilidadMes.utilidadNeta)}
              </p>
              <p className="mt-1 text-sm font-semibold text-violet-600 dark:text-violet-400">
                Gastos: {formatearPesos(utilidadMes.gastos.gastos)}
              </p>
            </Link>
          </div>
        )}

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
          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
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
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <section className="rounded-2xl bg-card p-5 shadow-suave">
              <h2 className="mb-3 flex items-baseline justify-between gap-2 font-bold">
                Ventas de los últimos 30 días
                <span className="text-sm font-medium text-muted-foreground">{negocios.nombre}</span>
              </h2>
              {dias.some((d) => d.total) ? (
                <GraficaBarras datos={dias.map((d) => ({ dia: d.dia, total: d.total }))} />
              ) : (
                <div className="flex h-44 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <Receipt className="size-6" />
                  Todavía no hay ventas en estos días.
                </div>
              )}
            </section>
            <section className="rounded-2xl bg-card p-5 shadow-suave">
              <h2 className="mb-2 flex items-baseline justify-between gap-2 font-bold">
                Más vendidos
                <span className="text-sm font-medium text-muted-foreground">Esta semana</span>
              </h2>
              {masVendidos.length ? (
                <ul>
                  {masVendidos.map((p, i) => (
                    <li key={p.productoId} className="flex items-center gap-3 py-2">
                      <Insignia color={COLORES[i % COLORES.length]} grande>
                        {iniciales(p.nombre)}
                      </Insignia>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatearCantidad(p.cantidad)} {NOMBRE_UNIDAD[p.unidad] ?? ""}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular-nums">{formatearPesos(p.total)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Aún no hay ventas esta semana.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const COLORES = ["azul", "ambar", "violeta", "verde", "rosa"] as const;
type Color = (typeof COLORES)[number];
const CLASES_COLOR: Record<Color, string> = {
  azul: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  ambar: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  violeta: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  verde: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  rosa: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
};
const NOMBRE_UNIDAD: Record<string, string> = { UNIDAD: "und", METRO: "m", KILO: "kg", GRAMO: "g", LITRO: "L", GALON: "gal" };

/** Cuadrito de color con un ícono o unas letras. */
function Insignia({ color, grande = false, children }: { color: Color; grande?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[10px] font-extrabold",
        grande ? "size-10 rounded-xl text-sm" : "size-8",
        CLASES_COLOR[color],
      )}
    >
      {children}
    </span>
  );
}

const iniciales = (nombre: string) =>
  nombre
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

const formatearCantidad = (c: string) => Number(c).toLocaleString("es-CO", { maximumFractionDigits: 3 });

const fechaLargaFormato = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});
function fechaLarga() {
  const t = fechaLargaFormato.format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Cifra({
  titulo,
  icono: Icono,
  color = "azul",
  valor,
  anterior,
  contra,
  destacado = false,
}: {
  titulo: string;
  icono: LucideIcon;
  color?: Color;
  valor: number;
  anterior: number;
  contra: string;
  destacado?: boolean;
}) {
  const cambio = variacion(valor, anterior);
  return (
    <div
      className={cn(
        "rounded-2xl bg-card p-4 shadow-suave md:p-5",
        destacado &&
          "col-span-2 bg-gradient-to-br from-destacado-desde to-destacado-hasta text-white shadow-[var(--sombra-destacado)] lg:col-span-1",
      )}
    >
      <p className={cn("flex items-center gap-2.5 text-sm font-semibold", destacado ? "text-white/85" : "text-muted-foreground")}>
        {destacado ? (
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-white/20">
            <Icono className="size-4" />
          </span>
        ) : (
          <Insignia color={color}>
            <Icono className="size-4" />
          </Insignia>
        )}
        {titulo}
      </p>
      <p
        className={cn(
          "mt-3 font-extrabold tracking-tight tabular-nums",
          destacado ? "text-3xl md:text-[34px]" : "text-2xl md:text-[28px]",
        )}
      >
        {formatearPesos(valor)}
      </p>
      <p className={cn("mt-1 flex flex-wrap items-center gap-1 text-sm", destacado ? "text-white/85" : "text-muted-foreground")}>
        {cambio === null ? (
          `Sin ventas para comparar con ${contra}`
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center font-semibold",
                destacado
                  ? "rounded-full bg-white/15 px-1.5 text-white"
                  : cambio >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
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
        "flex items-center gap-4 rounded-2xl border-l-[5px] bg-card p-4 shadow-suave transition-transform hover:-translate-y-0.5",
        rojo ? "border-l-rose-500" : "border-l-amber-500",
      )}
    >
      <Insignia color={rojo ? "rosa" : "ambar"} grande>
        <TriangleAlert className="size-5" />
      </Insignia>
      <div className="flex-1">
        <p className="font-bold">{titulo}</p>
        <p className="text-sm text-muted-foreground">{detalle}</p>
      </div>
      <ChevronRight className="size-5 text-muted-foreground" />
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
