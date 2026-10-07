import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { estadoDeCaja, listarCierres, verResumenDeCaja } from "@/lib/datos/caja";
import { fechaDeHoy, formatearDia, formatearHora, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { BotonReabrir } from "../abrir-caja";
import { CerrarCaja } from "./cerrar";

export const metadata: Metadata = { title: "Cierre de caja · Control Total" };

export default async function PaginaCaja() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) return <EstadoVacio icono={Wallet} titulo="Sin negocio" descripcion="No tienes un negocio asignado." />;
  const negocioId = ctx.negocioActivoId;
  const gestiona = puedeGestionar(ctx);
  const { hoy, pendiente } = await estadoDeCaja(ctx, negocioId);
  // Primero la que quedó abierta de otro día; si no, la de hoy.
  const porCerrar = pendiente ?? (hoy?.estado === "ABIERTA" ? hoy : null);
  const [resumen, cierres] = await Promise.all([
    porCerrar && gestiona ? verResumenDeCaja(ctx, porCerrar.id) : null,
    gestiona ? listarCierres(ctx, negocioId) : [],
  ]);
  const hoyFecha = fechaDeHoy().getTime();

  return (
    <div className="space-y-8">
      <EncabezadoPagina
        titulo="Cierre de caja"
        volver={{ href: "/ventas", texto: "Volver a la caja" }}
        subtitulo={porCerrar ? `Caja del ${formatearDia(porCerrar.fecha)}, abierta a las ${formatearHora(porCerrar.abiertaEn)}` : undefined}
      />

      {porCerrar ? (
        <div className="grid gap-6 md:grid-cols-2">
          <CerrarCaja cajaId={porCerrar.id} esperado={resumen?.esperado ?? null} />
          {resumen && (
            <dl className="space-y-2 self-start rounded-2xl border p-6 text-sm">
              <Fila nombre="Base" valor={resumen.base} />
              <Fila nombre="Ventas en efectivo" valor={resumen.ventasEfectivo} />
              {!!resumen.anulacionesEfectivo && <Fila nombre="Anulaciones en efectivo" valor={-resumen.anulacionesEfectivo} />}
              {!!resumen.devolucionesEfectivo && <Fila nombre="Devoluciones en efectivo" valor={-resumen.devolucionesEfectivo} />}
              {!!resumen.pagosProveedores && <Fila nombre="Pagos a proveedores en efectivo" valor={-resumen.pagosProveedores} />}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Efectivo esperado</dt>
                <dd className="tabular-nums">{formatearPesos(resumen.esperado)}</dd>
              </div>
              <p className="pt-2 text-muted-foreground">
                {resumen.ventas} {resumen.ventas === 1 ? "venta" : "ventas"} · Transferencias {formatearPesos(resumen.ventasTransferencia)} (no
                están en la caja)
              </p>
            </dl>
          )}
        </div>
      ) : (
        <EstadoVacio
          icono={Wallet}
          titulo={hoy ? "La caja de hoy ya está cerrada" : "No hay caja abierta"}
          descripcion={hoy ? "Mañana se abre una nueva desde la pantalla de ventas." : "Ábrela desde la pantalla de ventas para empezar a vender."}
          accion={
            <Button asChild variant="outline">
              <Link href="/ventas">Ir a ventas</Link>
            </Button>
          }
        />
      )}

      {gestiona && cierres.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Últimos cierres</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Día</th>
                  <th className="px-4 py-3 text-right font-medium">Esperado</th>
                  <th className="px-4 py-3 text-right font-medium">Contado</th>
                  <th className="px-4 py-3 text-right font-medium">Diferencia</th>
                  <th className="px-4 py-3 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cierres.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 tabular-nums">
                      {formatearDia(c.fecha)}
                      {c.estado === "ABIERTA" && <span className="ml-2 text-emerald-700 dark:text-emerald-400">Abierta</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.esperado === null ? "—" : formatearPesos(c.esperado)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.contado === null ? "—" : formatearPesos(c.contado)}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-medium tabular-nums",
                        c.diferencia !== null && c.diferencia < 0 && "text-destructive",
                        c.diferencia !== null && c.diferencia > 0 && "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {c.diferencia === null ? "—" : c.diferencia === 0 ? "Cuadra" : formatearPesos(c.diferencia)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.nota ?? ""}
                      {c.estado === "CERRADA" && c.fecha.getTime() === hoyFecha && (
                        <div className="mt-1">
                          <BotonReabrir cajaId={c.id} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{nombre}</dt>
      <dd className="tabular-nums">{formatearPesos(valor)}</dd>
    </div>
  );
}
