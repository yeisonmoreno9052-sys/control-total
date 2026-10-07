import type { Metadata } from "next";
import Link from "next/link";
import { History, Lock, Store, TriangleAlert, Wallet } from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { estadoDeCaja } from "@/lib/datos/caja";
import { formatearDia, formatearPesos } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { AbrirCaja, BotonReabrir } from "./abrir-caja";
import { CajaCliente } from "./caja-cliente";

export const metadata: Metadata = { title: "Ventas · Control Total" };

export default async function Ventas() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) {
    return <EstadoVacio icono={Store} titulo="Sin negocio" descripcion="No tienes un negocio asignado." />;
  }
  const negocioId = ctx.negocioActivoId;
  const { hoy, pendiente } = await estadoDeCaja(ctx, negocioId);

  const enlaces = (
    <div className="flex gap-1">
      <Button asChild variant="ghost" size="sm">
        <Link href="/ventas/historial">
          <History /> Historial
        </Link>
      </Button>
      {(hoy?.estado === "ABIERTA" || pendiente) && (
        <Button asChild variant="ghost" size="sm">
          <Link href="/ventas/caja">
            <Wallet /> Cerrar caja
          </Link>
        </Button>
      )}
    </div>
  );

  if (pendiente) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{enlaces}</div>
        <EstadoVacio
          icono={TriangleAlert}
          titulo={`La caja del ${formatearDia(pendiente.fecha)} quedó abierta`}
          descripcion="Ciérrala contando el efectivo antes de vender hoy, para que las cuentas de cada día no se mezclen."
          accion={
            <Button asChild size="lg">
              <Link href="/ventas/caja">Cerrar esa caja</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!hoy) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{enlaces}</div>
        <AbrirCaja />
      </div>
    );
  }

  if (hoy.estado === "CERRADA") {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{enlaces}</div>
        <EstadoVacio
          icono={Lock}
          titulo="La caja de hoy ya se cerró"
          descripcion={
            puedeGestionar(ctx)
              ? "Si falta registrar una venta, puedes volver a abrirla. Tendrás que cerrarla de nuevo."
              : "Si falta registrar una venta, pídele al administrador que la vuelva a abrir."
          }
          accion={puedeGestionar(ctx) && <BotonReabrir cajaId={hoy.id} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-emerald-500 align-middle" /> Caja abierta · Base{" "}
          <span className="font-medium text-foreground">{formatearPesos(hoy.base)}</span> · {ctx.nombre}
        </p>
        {enlaces}
      </div>
      {/* key: al cambiar de negocio arriba, la caja arranca con el carrito de ese negocio */}
      <CajaCliente key={negocioId} negocioId={negocioId} />
    </div>
  );
}
