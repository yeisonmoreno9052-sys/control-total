import type { Metadata } from "next";
import Link from "next/link";
import { Shirt } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { listarNovedades } from "@/lib/datos/estados";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { EditorCollage } from "./editor-collage";

export const metadata: Metadata = { title: "Mercancía nueva · Control Total" };

export default async function EstadoNovedades() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  const negocioId = ctx.negocioActivoId;
  const [empresa, negocio, piezas] = negocioId
    ? await Promise.all([obtenerEmpresa(ctx), obtenerDatosNegocio(ctx, negocioId), listarNovedades(ctx, negocioId)])
    : [null, null, []];

  return (
    <div>
      <EncabezadoPagina
        titulo="Compartir varias prendas"
        subtitulo="Escoge hasta 6 prendas, ponles precio de promoción si quieres y compártelas en WhatsApp o Instagram."
        volver={{ href: "/inventario", texto: "Inventario" }}
      />
      {piezas.length === 0 ? (
        <EstadoVacio
          icono={Shirt}
          titulo="No hay productos con stock"
          descripcion="Cuando entre mercancía al inventario, aquí puedes armar la imagen para tu Estado."
          accion={
            <Button asChild>
              <Link href="/inventario">Ir al inventario</Link>
            </Button>
          }
        />
      ) : (
        <EditorCollage
          piezas={piezas}
          marca={negocio?.nombre ?? empresa?.nombre ?? ""}
          logoUrl={empresa?.logoUrl ?? null}
          paleta={empresa?.paleta ?? "indigo"}
          telefono={negocio?.telefono ?? null}
        />
      )}
    </div>
  );
}
