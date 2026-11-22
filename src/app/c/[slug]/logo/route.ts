import { logoPublico } from "@/lib/datos/catalogo-publico";
import { tiendaDe } from "../tienda";

export async function GET(_: Request, { params }: RouteContext<"/c/[slug]/logo">) {
  const tienda = await tiendaDe((await params).slug);
  const logo = tienda ? await logoPublico(tienda) : null;
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: { "Content-Type": logo.tipo, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
