import { obtenerFotoCatalogo } from "@/lib/datos/fotos-catalogo";
import { obtenerContexto } from "@/lib/sesion";

/** Foto extra del catálogo (para verla en el inventario). No cambia: si se quita, se pone otra con otro id. */
export async function GET(_: Request, { params }: RouteContext<"/api/fotos-catalogo/[id]">) {
  const ctx = await obtenerContexto();
  const { id } = await params;
  const foto = await obtenerFotoCatalogo(ctx, id);
  if (!foto) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(foto.bytes), {
    headers: { "Content-Type": foto.tipo, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
