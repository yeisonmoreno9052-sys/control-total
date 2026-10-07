import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cuentasPorPagar } from "@/lib/datos/compras";
import { formatearDia, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { Pestanas } from "../comunes";

export const metadata: Metadata = {
  title: "Cuentas por pagar · Control Total",
};

export default async function PorPagar() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const cxp = await cuentasPorPagar(ctx, ctx.negocioActivoId);

  return (
    <div>
      <EncabezadoPagina titulo="Proveedores y compras" />
      <Pestanas activa="/proveedores/por-pagar" />

      {cxp.facturas.length === 0 ? (
        <EstadoVacio
          icono={PartyPopper}
          titulo="No le debes nada a ningún proveedor"
          descripcion="Aquí aparecen las facturas a crédito hasta que se terminen de pagar."
          accion={
            <Button asChild variant="outline">
              <Link href="/proveedores/facturas/nueva">Registrar factura</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border p-5">
              <p className="text-sm text-muted-foreground">Total por pagar</p>
              <p className="text-3xl font-bold tabular-nums">{formatearPesos(cxp.total)}</p>
            </div>
            <div className={cn("rounded-2xl border p-5", cxp.vencido > 0 && "border-destructive/40 bg-destructive/5")}>
              <p className="text-sm text-muted-foreground">Vencido</p>
              <p className={cn("text-3xl font-bold tabular-nums", cxp.vencido > 0 && "text-destructive")}>
                {formatearPesos(cxp.vencido)}
              </p>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="font-semibold">Por proveedor</h2>
            <ul className="divide-y rounded-xl border">
              {cxp.porProveedor.map((p) => (
                <li key={p.proveedorId}>
                  <Link
                    href={`/proveedores/directorio/${p.proveedorId}`}
                    className="flex items-center gap-3 p-4 hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{p.proveedor}</span>
                    <span className="text-sm text-muted-foreground">
                      {p.facturas} {p.facturas === 1 ? "factura" : "facturas"}
                    </span>
                    <span className="w-32 text-right font-semibold tabular-nums">{formatearPesos(p.saldo)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">Facturas, la que vence primero arriba</h2>
            <ul className="divide-y rounded-xl border">
              {cxp.facturas.map((f) => (
                <li
                  key={f.id}
                  className={cn(f.vencida && "bg-destructive/5", f.vencePronto && "bg-amber-50 dark:bg-amber-950/30")}
                >
                  <Link href={`/proveedores/facturas/${f.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/40">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{f.proveedor}</span>
                        {f.vencida && <Badge variant="destructive">Vencida</Badge>}
                        {f.vencePronto && <Badge variant="aviso">Vence esta semana</Badge>}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Factura {f.numero} ·{" "}
                        {f.vencimiento ? `vence ${formatearDia(f.vencimiento)}` : `del ${formatearDia(f.fecha)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-semibold tabular-nums", f.vencida && "text-destructive")}>
                        {formatearPesos(f.saldo)}
                      </p>
                      {f.pagado > 0 && <p className="text-sm text-muted-foreground tabular-nums">de {formatearPesos(f.total)}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
