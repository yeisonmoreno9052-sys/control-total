import { obtenerFotoProducto } from "@/lib/datos/fotos-producto";
import { obtenerContexto } from "@/lib/sesion";

/** Foto de un producto. La dirección lleva ?v=… y cambia cuando cambia la foto. */
export async function GET(_: Request, { params }: RouteContext<"/api/productos/[id]/foto">) {
  const ctx = await obtenerContexto();
  const { id } = await params;
  const foto = await obtenerFotoProducto(ctx, id.slice(0, 40));
  if (!foto) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(foto.bytes), {
    headers: {
      "Content-Type": foto.tipo,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
