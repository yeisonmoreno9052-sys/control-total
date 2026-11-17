import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCategorias } from "@/lib/datos/categorias";
import { diaEnBogota } from "@/lib/formato";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioPromocion } from "./formulario";

export const metadata: Metadata = { title: "Nueva promoción · Control Total" };

export default async function NuevaPromocion() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const categorias = await listarCategorias(ctx, ctx.negocioActivoId);
  const hoy = diaEnBogota();
  const semana = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl">
      <EncabezadoPagina
        titulo="Nueva promoción"
        subtitulo="Escoge las prendas y los días. La caja pone el descuento sola y al terminar vuelve al precio normal."
        volver={{ href: "/inventario/promociones", texto: "Promociones" }}
      />
      <FormularioPromocion categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))} hoy={hoy} semana={semana} />
    </div>
  );
}
