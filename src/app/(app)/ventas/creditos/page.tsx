import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, HandCoins, Search } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listarDeudores, negocioPermiteCredito } from "@/lib/datos/creditos";
import { formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Créditos · Control Total" };

export default async function Creditos({ searchParams }: PageProps<"/ventas/creditos">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) {
    return <EstadoVacio icono={HandCoins} titulo="Sin negocio" descripcion="No tienes un negocio asignado." />;
  }
  const negocioId = ctx.negocioActivoId;
  if (!(await negocioPermiteCredito(ctx, negocioId))) {
    return (
      <EstadoVacio
        icono={HandCoins}
        titulo="Este negocio no fía"
        descripcion="El administrador puede activar las ventas a crédito en Configuración → Cómo vende."
        accion={
          <Button asChild variant="outline">
            <Link href="/ventas">Volver a la caja</Link>
          </Button>
        }
      />
    );
  }
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const { deudores, totalDebe } = await listarDeudores(ctx, negocioId, q);

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        titulo="Créditos"
        volver={{ href: "/ventas", texto: "Volver a la caja" }}
        subtitulo={
          deudores.length ? (
            <>
              {deudores.length} {deudores.length === 1 ? "persona debe" : "personas deben"} · Total{" "}
              <span className="font-semibold text-foreground">{formatearPesos(totalDebe)}</span>
            </>
          ) : undefined
        }
      />

      <form className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre" aria-label="Buscar por nombre" className="h-12 pl-10 text-lg" />
      </form>

      {deudores.length === 0 ? (
        <EstadoVacio
          icono={HandCoins}
          titulo={q ? "Nadie con ese nombre debe" : "Nadie debe nada"}
          descripcion="Para fiar, en la caja toca Cobrar y elige Fiado."
          accion={
            <Button asChild>
              <Link href="/ventas">Ir a la caja</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-2xl border bg-card shadow-suave">
          {deudores.map((d) => (
            <li key={d.id}>
              <Link href={`/ventas/creditos/${d.id}`} className="flex items-center gap-3 px-4 py-4 hover:bg-muted active:bg-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{d.nombre}</p>
                  <p className="text-sm text-muted-foreground">
                    {[d.telefono, d.abonado ? `Ha abonado ${formatearPesos(d.abonado)}` : null].filter(Boolean).join(" · ") ||
                      "Sin abonos"}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("text-xl font-bold tabular-nums", d.debe < 0 && "text-emerald-700 dark:text-emerald-400")}>
                    {formatearPesos(Math.abs(d.debe))}
                  </p>
                  <p className="text-xs text-muted-foreground">{d.debe < 0 ? "a favor" : "debe"}</p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
