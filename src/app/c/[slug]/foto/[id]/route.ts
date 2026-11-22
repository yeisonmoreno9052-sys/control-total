import { fotoPublica } from "@/lib/datos/catalogo-publico";
import { tiendaDe } from "../../tienda";

/** Foto de una prenda del catálogo. La dirección lleva ?v=… y cambia cuando cambia la foto. */
export async function GET(_: Request, { params }: RouteContext<"/c/[slug]/foto/[id]">) {
  const { slug, id } = await params;
  const tienda = await tiendaDe(slug);
  const foto = tienda ? await fotoPublica(tienda, id) : null;
  if (!foto) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(foto.bytes), {
    headers: { "Content-Type": foto.tipo, "Cache-Control": "public, max-age=604800", "X-Content-Type-Options": "nosniff" },
  });
}
