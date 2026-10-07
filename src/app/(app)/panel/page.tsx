import type { Metadata } from "next";
import { Package, Receipt, Store } from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { formatearFecha } from "@/lib/formato";
import { obtenerContexto } from "@/lib/sesion";

export const metadata: Metadata = { title: "Inicio · Control Total" };

export default async function Panel() {
  const ctx = await obtenerContexto();
  const negocio = ctx.negocioActivoId ? await obtenerNegocio(ctx, ctx.negocioActivoId) : null;
  const primerNombre = ctx.nombre.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{formatearFecha(new Date())}</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Hola, {primerNombre}</h1>
        {negocio && <p className="text-muted-foreground">{negocio.nombre}</p>}
      </div>

      {!negocio ? (
        <EstadoVacio
          icono={Store}
          titulo="Aún no tienes un negocio asignado"
          descripcion="Pídele al administrador que te dé acceso a un negocio para empezar a trabajar."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <EstadoVacio
            icono={Package}
            titulo="Todavía no hay productos"
            descripcion={`Agrega o importa los productos de ${negocio.nombre} para empezar a vender.`}
            accion={
              <Button disabled variant="outline">
                Agregar productos · pronto
              </Button>
            }
          />
          <EstadoVacio
            icono={Receipt}
            titulo="Aún no hay ventas hoy"
            descripcion="Cuando registres ventas, aquí verás cómo va el día."
            accion={
              <Button disabled variant="outline">
                Ir a la caja · pronto
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
