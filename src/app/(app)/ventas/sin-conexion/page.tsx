import type { Metadata } from "next";
import { Store } from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { CajaCliente } from "../caja-cliente";
import { AvisoCajaSinConexion } from "./aviso";

export const metadata: Metadata = { title: "Caja · Control Total" };

/**
 * La caja que abre cuando no hay internet: el navegador guarda esta página (ver public/sw.js)
 * y la muestra si al abrir el sistema no hay conexión. Vende con la copia de productos.
 */
export default async function CajaSinConexion() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId) {
    return <EstadoVacio icono={Store} titulo="Sin negocio" descripcion="No tienes un negocio asignado." />;
  }
  return (
    <div className="space-y-4">
      <AvisoCajaSinConexion />
      <CajaCliente key={ctx.negocioActivoId} negocioId={ctx.negocioActivoId} />
    </div>
  );
}
