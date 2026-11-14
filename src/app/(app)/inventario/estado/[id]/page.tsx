import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { NoEncontrado } from "@/components/layout/no-encontrado";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { obtenerPiezaEstado } from "@/lib/datos/estados";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { exigirModulo } from "@/lib/modulos";
import { puedeEditarProductos } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { EditorPieza } from "./editor-pieza";

export const metadata: Metadata = {
  title: "Compartir en Estado · Control Total",
};

export default async function EstadoPieza({ params }: PageProps<"/inventario/estado/[id]">) {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const { id } = await params;
  const pieza = await obtenerPiezaEstado(ctx, id);
  if (!pieza) return <NoEncontrado />;
  const [empresa, negocio] = await Promise.all([obtenerEmpresa(ctx), obtenerDatosNegocio(ctx, pieza.negocioId)]);

  return (
    <div>
      <EncabezadoPagina
        titulo="Compartir en Estado"
        subtitulo="Arma la imagen para tu Estado de WhatsApp o tu historia de Instagram. Los cambios de aquí no cambian el inventario."
        volver={{
          href: pieza.prendaId ? `/inventario/prenda/${pieza.prendaId}` : `/inventario/${id}`,
          texto: pieza.nombre,
        }}
      />
      <EditorPieza
        pieza={pieza}
        marca={negocio?.nombre ?? empresa?.nombre ?? ""}
        logoUrl={empresa?.logoUrl ?? null}
        paleta={empresa?.paleta ?? "indigo"}
        telefono={negocio?.telefono ?? null}
        puedeFoto={puedeEditarProductos(ctx)}
      />
    </div>
  );
}
