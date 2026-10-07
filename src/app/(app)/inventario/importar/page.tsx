import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar productos · Control Total" };

export default async function Importar() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocio = await obtenerNegocio(ctx, ctx.negocioActivoId);

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina
        titulo="Importar productos"
        subtitulo={`Desde Excel o CSV a ${negocio?.nombre ?? "este negocio"}`}
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      <Importador />
    </div>
  );
}
