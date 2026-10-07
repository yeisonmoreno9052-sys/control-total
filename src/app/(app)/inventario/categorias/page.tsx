import type { Metadata } from "next";
import { FolderTree } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { listarCategorias, obtenerMargenNegocio } from "@/lib/datos/categorias";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { formatearPesos } from "@/lib/formato";
import { precioSugerido } from "@/lib/inventario/precios";
import { exigirModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { FilaCategoria, FormularioMargen, NuevaCategoria } from "./formularios";

export const metadata: Metadata = { title: "Categorías · Control Total" };

export default async function Categorias() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeGestionar(ctx) || !ctx.negocioActivoId) return <SinPermiso />;
  const [categorias, margen, negocio] = await Promise.all([
    listarCategorias(ctx, ctx.negocioActivoId, { incluirInactivas: true }),
    obtenerMargenNegocio(ctx, ctx.negocioActivoId),
    obtenerNegocio(ctx, ctx.negocioActivoId),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <EncabezadoPagina titulo="Categorías y márgenes" subtitulo={negocio?.nombre} volver={{ href: "/inventario", texto: "Inventario" }} />

      <section className="space-y-3 rounded-xl border p-4 md:p-6">
        <h2 className="font-semibold">Margen del negocio</h2>
        <p className="text-sm text-muted-foreground">
          Se usa para sugerir el precio de venta a partir del costo. Ejemplo con {margen} %: costo $ 10.000 → precio
          sugerido {formatearPesos(precioSugerido(10000, margen))}.
        </p>
        <FormularioMargen margen={margen} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Categorías</h2>
        <p className="text-sm text-muted-foreground">
          Si una categoría tiene su propio margen, se usa en lugar del margen del negocio (por ejemplo, tornillería al 60 %).
        </p>
        <NuevaCategoria />
        {categorias.length === 0 ? (
          <EstadoVacio icono={FolderTree} titulo="Aún no hay categorías" descripcion="Crea la primera arriba, o se crean solas al importar desde Excel." />
        ) : (
          <ul className="divide-y rounded-xl border">
            {categorias.map((c) => (
              <FilaCategoria key={c.id} categoria={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
