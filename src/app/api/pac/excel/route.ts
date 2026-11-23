import { AccesoDenegado } from "@/lib/datos/alcance";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { listarOperacionesPac, negocioUsaPac } from "@/lib/datos/pac";
import { tieneModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { reporteAExcel } from "@/lib/reportes/excel";
import { reportePac } from "@/lib/reportes/pac";
import { describirPeriodo, periodoDeParametros } from "@/lib/reportes/periodos";
import { obtenerContexto } from "@/lib/sesion";

/** Descarga en Excel las recargas y retiros del PAC de las fechas que se ven en pantalla. */
export async function GET(peticion: Request) {
  const ctx = await obtenerContexto();
  const negocioId = ctx.negocioActivoId;
  if (!tieneModulo(ctx, "VENTAS") || !puedeGestionar(ctx) || !negocioId) return new Response("Sin permiso", { status: 403 });
  const periodo = periodoDeParametros(Object.fromEntries(new URL(peticion.url).searchParams), "hoy");
  try {
    if (!(await negocioUsaPac(ctx, negocioId))) return new Response("Sin permiso", { status: 403 });
    const [operaciones, negocio, empresa] = await Promise.all([
      listarOperacionesPac(ctx, negocioId, periodo.desde, periodo.hasta),
      obtenerNegocio(ctx, negocioId),
      obtenerEmpresa(ctx),
    ]);
    const archivo = await reporteAExcel(reportePac(operaciones, negocio?.nombre ?? "", describirPeriodo(periodo)), empresa?.nombre ?? "");
    return new Response(new Uint8Array(archivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="pac-${periodo.desde}-a-${periodo.hasta}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AccesoDenegado) return new Response("Sin permiso", { status: 403 });
    throw error;
  }
}
