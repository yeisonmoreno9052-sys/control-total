import { fotoCatalogoPublica } from "@/lib/datos/catalogo-publico";
import { tiendaDe } from "../../tienda";

/** Foto extra de una prenda del catálogo (espalda, detalle…). No cambia nunca: si se quita, sale con otro id. */
export async function GET(_: Request, { params }: RouteContext<"/c/[slug]/fotos/[id]">) {
  const { slug, id } = await params;
  const tienda = await tiendaDe(slug);
  const foto = tienda ? await fotoCatalogoPublica(tienda, id) : null;
  if (!foto) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(foto.bytes), {
    headers: { "Content-Type": foto.tipo, "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff" },
  });
}
