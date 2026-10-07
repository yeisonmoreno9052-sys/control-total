import { AccesoDenegado } from "@/lib/datos/alcance";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { tieneModulo } from "@/lib/modulos";
import { puedeGestionar } from "@/lib/permisos";
import { reporteDesdeParametros } from "@/lib/reportes/armar";
import { reporteAExcel } from "@/lib/reportes/excel";
import { obtenerContexto } from "@/lib/sesion";

/** Descarga el reporte en Excel, con el mismo negocio, fechas y vista que se ven en pantalla. */
export async function GET(peticion: Request) {
  const ctx = await obtenerContexto();
  if (!tieneModulo(ctx, "REPORTES") || !puedeGestionar(ctx)) return new Response("Sin permiso", { status: 403 });
  const parametros = Object.fromEntries(new URL(peticion.url).searchParams);
  try {
    const [{ vista, periodo, reporte }, empresa] = await Promise.all([
      reporteDesdeParametros(ctx, ctx.negocioActivoId, parametros),
      obtenerEmpresa(ctx),
    ]);
    const archivo = await reporteAExcel(reporte, empresa?.nombre ?? "");
    const fechas = vista === "inventario" ? periodo.hasta : `${periodo.desde}-a-${periodo.hasta}`;
    return new Response(new Uint8Array(archivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte-${vista}-${fechas}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AccesoDenegado) return new Response("Sin permiso", { status: 403 });
    throw error;
  }
}
