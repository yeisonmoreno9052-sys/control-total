import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, SearchX } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { listarCajerosConVentas, listarVentas } from "@/lib/datos/ventas";
import { diaEnBogota, formatearFecha, formatearHora, formatearPesos, rangoDelDia } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { formatearConsecutivo, NOMBRE_MEDIO } from "@/lib/ventas/recibo";
import { cn } from "@/lib/utils";
import { EstadoVenta } from "../estado-venta";

export const metadata: Metadata = { title: "Historial de ventas · Control Total" };

type Parametros = { desde?: string; hasta?: string; cajero?: string; medio?: string; pagina?: string };
const esDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function enlace(p: Parametros, cambios: Partial<Parametros>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p, ...cambios })) if (v) q.set(k, v);
  return `/ventas/historial?${q}`;
}

export default async function Historial({ searchParams }: PageProps<"/ventas/historial">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) return <EstadoVacio icono={Receipt} titulo="Sin negocio" descripcion="No tienes un negocio asignado." />;
  const negocioId = ctx.negocioActivoId;
  const sp = await searchParams;
  const hoy = diaEnBogota();
  const p: Parametros = {
    desde: esDia(sp.desde) ? sp.desde : hoy,
    hasta: esDia(sp.hasta) ? sp.hasta : esDia(sp.desde) ? sp.desde : hoy,
    cajero: typeof sp.cajero === "string" ? sp.cajero : undefined,
    medio: sp.medio === "EFECTIVO" || sp.medio === "TRANSFERENCIA" ? sp.medio : undefined,
    pagina: typeof sp.pagina === "string" ? sp.pagina : undefined,
  };
  const [desde, hasta] = p.desde! <= p.hasta! ? [p.desde!, p.hasta!] : [p.hasta!, p.desde!];

  const [resultado, cajeros] = await Promise.all([
    listarVentas(ctx, negocioId, {
      desde: rangoDelDia(desde).inicio,
      hasta: rangoDelDia(hasta).fin,
      usuarioId: p.cajero,
      medio: p.medio as "EFECTIVO" | "TRANSFERENCIA" | undefined,
      pagina: Number(p.pagina) || 1,
    }),
    listarCajerosConVentas(ctx, negocioId),
  ]);
  const gestiona = puedeGestionar(ctx);

  return (
    <div>
      <EncabezadoPagina
        titulo="Historial de ventas"
        volver={{ href: "/ventas", texto: "Volver a la caja" }}
        subtitulo={
          <>
            {resultado.total.toLocaleString("es-CO")} {resultado.total === 1 ? "venta" : "ventas"}
            {/* El total vendido es una cifra financiera: el cajero no la ve (y así el cierre a ciegas sigue a ciegas). */}
            {gestiona && <> · {formatearPesos(resultado.sumaTotal)} sin contar anuladas</>}
          </>
        }
      />

      <form className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" name="desde" type="date" defaultValue={desde} max={hoy} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" name="hasta" type="date" defaultValue={hasta} max={hoy} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cajero">Cajero</Label>
          <NativeSelect id="cajero" name="cajero" defaultValue={p.cajero ?? ""}>
            <option value="">Todos</option>
            {cajeros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="medio">Medio de pago</Label>
          <NativeSelect id="medio" name="medio" defaultValue={p.medio ?? ""}>
            <option value="">Todos</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </NativeSelect>
        </div>
        <Button type="submit" className="col-span-2 h-11 md:col-span-1">
          Buscar
        </Button>
      </form>

      {resultado.ventas.length === 0 ? (
        <EstadoVacio
          icono={SearchX}
          titulo="No hay ventas en esas fechas"
          descripcion="Cambia las fechas o los filtros."
          accion={
            <Button asChild variant="outline">
              <Link href="/ventas">Ir a la caja</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y rounded-xl border md:hidden">
            {resultado.ventas.map((v) => (
              <li key={v.id}>
                <Link href={`/ventas/${v.id}`} className="flex items-center gap-3 p-4 active:bg-muted">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex items-center gap-2 font-medium">
                      Nº {formatearConsecutivo(v.consecutivo)} <EstadoVenta estado={v.estado} />
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {formatearFecha(v.creadoEn)} {formatearHora(v.creadoEn)} · {v.cajero}
                      {v.cliente && ` · ${v.cliente}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-semibold tabular-nums", v.estado === "ANULADA" && "text-muted-foreground line-through")}>
                      {formatearPesos(v.total)}
                    </p>
                    <p className="text-sm text-muted-foreground">{v.medios.map((m) => NOMBRE_MEDIO[m]).join(" + ")}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nº</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Cajero</th>
                  <th className="px-4 py-3 font-medium">Pago</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resultado.ventas.map((v) => (
                  <tr key={v.id} className="relative hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/ventas/${v.id}`} className="font-medium tabular-nums after:absolute after:inset-0">
                        {formatearConsecutivo(v.consecutivo)}
                      </Link>{" "}
                      <EstadoVenta estado={v.estado} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatearFecha(v.creadoEn)} <span className="text-muted-foreground">{formatearHora(v.creadoEn)}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{v.cliente ?? "—"}</td>
                    <td className="px-4 py-3">{v.cajero}</td>
                    <td className="px-4 py-3">{v.medios.map((m) => NOMBRE_MEDIO[m]).join(" + ")}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-medium tabular-nums",
                        v.estado === "ANULADA" && "text-muted-foreground line-through",
                      )}
                    >
                      {formatearPesos(v.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {resultado.paginas > 1 && (
            <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Páginas">
              <Button asChild variant="outline" className={cn(resultado.pagina <= 1 && "pointer-events-none opacity-50")}>
                <Link href={enlace({ ...p, desde, hasta }, { pagina: String(resultado.pagina - 1) })}>Anterior</Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {resultado.pagina} de {resultado.paginas}
              </span>
              <Button
                asChild
                variant="outline"
                className={cn(resultado.pagina >= resultado.paginas && "pointer-events-none opacity-50")}
              >
                <Link href={enlace({ ...p, desde, hasta }, { pagina: String(resultado.pagina + 1) })}>Siguiente</Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
