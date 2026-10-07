import { AccesoDenegado } from "@/lib/datos/alcance";
import { obtenerAdjunto } from "@/lib/datos/compras";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

/** Foto o PDF de una factura de compra. Solo para quien puede ver esa factura. */
export async function GET(_: Request, { params }: RouteContext<"/api/adjuntos/[id]">) {
  const ctx = await obtenerContexto();
  const { id } = await params;
  let adjunto;
  try {
    exigirModulo(ctx, "PROVEEDORES");
    adjunto = await obtenerAdjunto(ctx, id.slice(0, 40));
  } catch (error) {
    // Un cajero (o un módulo apagado) recibe lo mismo que si el archivo no existiera.
    if (error instanceof AccesoDenegado) return new Response(null, { status: 404 });
    throw error;
  }
  if (!adjunto) return new Response(null, { status: 404 });
  const nombre = encodeURIComponent(adjunto.nombre);
  return new Response(new Uint8Array(adjunto.datos), {
    headers: {
      "Content-Type": adjunto.tipo,
      "Content-Disposition": `inline; filename*=UTF-8''${nombre}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
