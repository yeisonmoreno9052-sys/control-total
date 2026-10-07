import { AccesoDenegado } from "@/lib/datos/alcance";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { catalogoCaja } from "@/lib/datos/productos";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

/**
 * Copia de los productos del negocio activo para vender sin internet, con los datos del
 * recibo. ?desde=<fecha> trae solo lo que cambió desde entonces.
 */
export async function GET(peticion: Request) {
  const ctx = await obtenerContexto();
  const negocioId = ctx.negocioActivoId;
  if (!negocioId) return new Response(null, { status: 404 });
  const desdeTexto = new URL(peticion.url).searchParams.get("desde");
  const desde = desdeTexto ? new Date(desdeTexto) : null;
  try {
    exigirModulo(ctx, "VENTAS");
    const [catalogo, negocio, empresa] = await Promise.all([
      catalogoCaja(ctx, negocioId, desde && !Number.isNaN(desde.getTime()) ? desde : null),
      obtenerDatosNegocio(ctx, negocioId),
      obtenerEmpresa(ctx),
    ]);
    return Response.json(
      { negocioId, ...catalogo, negocio, logoUrl: empresa?.logoUrl ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AccesoDenegado) return new Response(null, { status: 403 });
    throw error;
  }
}
