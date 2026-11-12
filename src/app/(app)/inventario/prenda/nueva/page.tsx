import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCategorias, obtenerMargenNegocio } from "@/lib/datos/categorias";
import { obtenerPreferenciasVenta } from "@/lib/datos/negocios";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos, puedeVerCostos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FormularioPrenda } from "../formulario-prenda";

export const metadata: Metadata = { title: "Nueva prenda · Control Total" };

export default async function NuevaPrenda() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeEditarProductos(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;
  const [categorias, margen, preferencias] = await Promise.all([
    listarCategorias(ctx, negocioId),
    obtenerMargenNegocio(ctx, negocioId),
    obtenerPreferenciasVenta(ctx, negocioId),
  ]);

  return (
    <div className="max-w-4xl">
      <EncabezadoPagina
        titulo="Nueva prenda"
        subtitulo="Créala una vez con todas sus tallas y colores."
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      <FormularioPrenda
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre, margenSugerido: c.margenSugerido }))}
        margenNegocio={margen}
        ivaPorDefecto={preferencias.ivaPorDefecto}
        verCostos={puedeVerCostos(ctx)}
      />
    </div>
  );
}
