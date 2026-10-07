import { AccesoDenegado } from "@/lib/datos/alcance";
import { generarPlantilla } from "@/lib/datos/importacion";
import { exigirModulo } from "@/lib/modulos";
import { exigirGestion } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";

export async function GET() {
  const ctx = await obtenerContexto();
  try {
    exigirModulo(ctx, "INVENTARIO");
    exigirGestion(ctx);
  } catch (error) {
    if (error instanceof AccesoDenegado) return new Response("No tienes permiso para descargar esto.", { status: 403 });
    throw error;
  }
  const archivo = await generarPlantilla();
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
