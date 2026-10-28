import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { SubirFotos } from "./subir-fotos";

export const metadata: Metadata = { title: "Subir fotos · Control Total" };

export default async function SubirFotosPagina() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeEditarProductos(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocio = await obtenerNegocio(ctx, ctx.negocioActivoId);

  return (
    <div className="max-w-3xl">
      <EncabezadoPagina
        titulo="Subir fotos"
        subtitulo={`Varias de una vez a ${negocio?.nombre ?? "este negocio"}`}
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      <SubirFotos />
    </div>
  );
}
