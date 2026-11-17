import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { Button } from "@/components/ui/button";
import { listarCategorias } from "@/lib/datos/categorias";
import { estadoFotos } from "@/lib/datos/lectura-factura";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { hayLector } from "@/lib/ia/lector";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { CargarConFotos } from "./cargar-con-fotos";

export const metadata: Metadata = { title: "Cargar productos con fotos · Control Total" };

export default async function CargarConFotosPagina() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;
  const [negocio, fotos, categorias] = await Promise.all([
    obtenerNegocio(ctx, negocioId),
    estadoFotos(ctx, hayLector()),
    listarCategorias(ctx, negocioId),
  ]);

  return (
    <div className="max-w-5xl">
      <EncabezadoPagina
        titulo="Cargar productos con fotos"
        subtitulo={`Toma una foto de cada producto y créalos todos de una vez en ${negocio?.nombre ?? "este negocio"}.`}
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      {fotos.disponible ? (
        <CargarConFotos
          // La pantalla se reinicia si cambian de negocio con el selector.
          key={negocioId}
          usadas={fotos.usadas}
          limite={fotos.limite}
          categorias={categorias.filter((c) => c.activo).map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      ) : (
        <EstadoVacio
          icono={Sparkles}
          titulo="Esta función no está activa"
          descripcion="Cargar productos con fotos se activa junto con “Facturas con foto”. Pídele a EMY TELECOM que la active para tu empresa."
          accion={
            <Button asChild variant="outline">
              <Link href="/inventario">Volver al inventario</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
