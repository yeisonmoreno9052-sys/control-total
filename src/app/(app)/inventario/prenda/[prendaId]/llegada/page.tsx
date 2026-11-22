import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { coloresUsados, obtenerPrenda } from "@/lib/datos/prendas";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { ClientesEsperando } from "../../../../configuracion/catalogo/esperando";
import { FormularioLlegada } from "./formulario";

export const metadata: Metadata = { title: "Llegó mercancía · Control Total" };

export default async function LlegadaPrenda({ params, searchParams }: PageProps<"/inventario/prenda/[prendaId]/llegada">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  if (!puedeEditarProductos(ctx)) return <SinPermiso />;
  const { prendaId } = await params;
  const sp = await searchParams;
  const prenda = await obtenerPrenda(ctx, prendaId);
  if (!prenda) return <NoEncontrado />;
  const colores = await coloresUsados(ctx, prenda.negocioId);
  const stock = prenda.variantes.filter((v) => v.activo).map((v) => `${v.talla}${v.color ? ` ${v.color}` : ""}: ${formatearCantidad(v.stock)}`);
  const volver = typeof sp.volver === "string" && sp.volver.startsWith("/") ? sp.volver : `/inventario/prenda/${prendaId}`;

  return (
    <div className="max-w-4xl">
      <EncabezadoPagina
        titulo="Llegó mercancía"
        subtitulo={`${prenda.nombre}: escribe cuántas llegaron de cada talla. Si llegó una talla o un color nuevo, agrégalo abajo.`}
        volver={{ href: volver, texto: "Volver" }}
      />
      <div className="mb-6">
        <ClientesEsperando ctx={ctx} negocioId={prenda.negocioId} prendaId={prendaId} />
      </div>
      <FormularioLlegada
        prendaId={prendaId}
        tallas={prenda.tallas}
        colores={prenda.colores}
        stock={stock}
        coloresGuardados={colores}
      />
    </div>
  );
}
