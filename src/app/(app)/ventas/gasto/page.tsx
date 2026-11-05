import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { CATEGORIAS_CAJA, CATEGORIAS_GASTO } from "@/lib/datos/movimientos-caja";
import { exigirModulo } from "@/lib/modulos";
import { puedeAnotarGastos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioGasto } from "./formulario";

export const metadata: Metadata = { title: "Anotar gasto · Control Total" };

// Gasto pagado con plata de la caja, desde la pantalla de ventas (sirve al cajero con permiso).
export default async function AnotarGasto() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  if (!ctx.negocioActivoId || !puedeAnotarGastos(ctx)) {
    return (
      <EstadoVacio
        icono={Receipt}
        titulo="No tienes permiso para anotar gastos"
        descripcion="Pídele al administrador que te lo active en Configuración → Usuarios."
      />
    );
  }
  const categorias = CATEGORIAS_GASTO.map((c) => ({ valor: c, nombre: CATEGORIAS_CAJA[c].nombre }));
  return (
    <div className="mx-auto max-w-lg">
      <EncabezadoPagina
        titulo="Anotar gasto"
        volver={{ href: "/ventas", texto: "Volver a la caja" }}
        subtitulo="Lo que se pagó hoy con plata de la caja. Así el cierre cuadra."
      />
      <FormularioGasto categorias={categorias} />
    </div>
  );
}
