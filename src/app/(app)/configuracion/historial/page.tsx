import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { SelectorParametro } from "@/components/reportes/selector-parametro";
import { SelectorPeriodo } from "@/components/reportes/selector-periodo";
import { Button } from "@/components/ui/button";
import { listarHistorial, personasDelHistorial } from "@/lib/datos/historial";
import { listarNegocios } from "@/lib/datos/negocios";
import { formatearFecha, formatearHora } from "@/lib/formato";
import { GRUPOS_HISTORIAL, type GrupoHistorial } from "@/lib/historial/describir";
import { puedeGestionar } from "@/lib/permisos";
import { describirPeriodo, periodoDeParametros } from "@/lib/reportes/periodos";
import { obtenerContexto } from "@/lib/sesion";
import { PestanasConfiguracion } from "../pestanas";

export const metadata: Metadata = { title: "Historial de cambios · Control Total" };

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function Historial({ searchParams }: PageProps<"/configuracion/historial">) {
  const ctx = await obtenerContexto();
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const sp = await searchParams;
  const periodo = periodoDeParametros(sp, "semana");
  const negocios = await listarNegocios(ctx);
  const negocioId = negocios.some((n) => n.id === texto(sp.negocio)) ? texto(sp.negocio) : null;
  const grupo = texto(sp.grupo) in GRUPOS_HISTORIAL ? (texto(sp.grupo) as GrupoHistorial) : null;
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(texto(sp.pagina), 10) || 1));
  const filtro = { desde: periodo.desde, hasta: periodo.hasta, negocioId, grupo };
  const personas = await personasDelHistorial(ctx, filtro);
  const usuarioId = personas.some((p) => p.id === texto(sp.persona)) ? texto(sp.persona) : null;
  const { entradas, total, paginas } = await listarHistorial(ctx, { ...filtro, usuarioId, pagina });

  const enlacePagina = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "pagina") p.set(k, v);
    if (n > 1) p.set("pagina", String(n));
    return `/configuracion/historial?${p.toString()}`;
  };

  // Agrupado por día, en hora de Bogotá.
  const dias: { dia: string; entradas: typeof entradas }[] = [];
  for (const e of entradas) {
    const dia = formatearFecha(e.creadoEn);
    const ultimo = dias.at(-1);
    if (ultimo?.dia === dia) ultimo.entradas.push(e);
    else dias.push({ dia, entradas: [e] });
  }

  return (
    <div>
      <EncabezadoPagina titulo="Configuración" />
      <PestanasConfiguracion activa="/configuracion/historial" rol={ctx.rol} />
      <p className="mb-4 text-muted-foreground">
        Quién hizo qué y cuándo: anulaciones, ajustes de stock, cambios de precio, usuarios y más. No se puede borrar ni editar.
      </p>

      <div className="mb-5 space-y-3">
        <SelectorPeriodo periodo={periodo} />
        <div className="flex flex-wrap gap-3">
          {negocios.length > 1 && (
            <SelectorParametro
              parametro="negocio"
              etiqueta="Negocio"
              todos="Todos los negocios"
              opciones={negocios.map((n) => ({ valor: n.id, nombre: n.nombre }))}
              valor={negocioId ?? ""}
            />
          )}
          <SelectorParametro
            parametro="grupo"
            etiqueta="Tipo"
            todos="Todo"
            opciones={Object.entries(GRUPOS_HISTORIAL).map(([valor, g]) => ({ valor, nombre: g.nombre }))}
            valor={grupo ?? ""}
          />
          <SelectorParametro
            parametro="persona"
            etiqueta="Persona"
            todos="Todas las personas"
            opciones={personas.map((p) => ({ valor: p.id, nombre: p.nombre }))}
            valor={usuarioId ?? ""}
          />
        </div>
      </div>

      {entradas.length === 0 ? (
        <EstadoVacio
          icono={History}
          titulo="No hay cambios en estas fechas"
          descripcion={`Nada registrado del ${describirPeriodo(periodo)}. Prueba con otras fechas o quita los filtros.`}
          accion={
            <Button asChild variant="outline">
              <Link href="/configuracion/historial?periodo=mes">Ver todo el mes</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString("es-CO")} {total === 1 ? "registro" : "registros"} · {describirPeriodo(periodo)}
          </p>
          {dias.map((d) => (
            <section key={d.dia} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{d.dia}</h2>
              <ul className="divide-y rounded-xl border">
                {d.entradas.map((e) => (
                  <li key={e.id} className="flex gap-4 p-4">
                    <span className="w-20 shrink-0 pt-0.5 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatearHora(e.creadoEn)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words">
                        <span className="font-semibold">{e.usuario}</span> {e.frase}
                      </p>
                      {(e.detalle || (e.negocio && !negocioId && negocios.length > 1)) && (
                        <p className="text-sm break-words text-muted-foreground">
                          {[e.detalle, !negocioId && negocios.length > 1 ? e.negocio : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {paginas > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label="Páginas">
              <Button asChild variant="outline" size="lg" className={pagina <= 1 ? "pointer-events-none opacity-40" : ""}>
                <Link href={enlacePagina(pagina - 1)} aria-disabled={pagina <= 1}>
                  <ChevronLeft /> Más recientes
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {pagina} de {paginas}
              </span>
              <Button asChild variant="outline" size="lg" className={pagina >= paginas ? "pointer-events-none opacity-40" : ""}>
                <Link href={enlacePagina(pagina + 1)} aria-disabled={pagina >= paginas}>
                  Más antiguos <ChevronRight />
                </Link>
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
