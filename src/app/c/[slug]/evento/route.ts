import { registrarEvento } from "@/lib/datos/catalogo-publico";
import { tiendaDe } from "../tienda";

/** Cuenta una vista o un pedido por WhatsApp de una prenda. Body: { clave, tipo } */
export async function POST(req: Request, { params }: RouteContext<"/c/[slug]/evento">) {
  const tienda = await tiendaDe((await params).slug);
  if (!tienda) return new Response(null, { status: 404 });
  let cuerpo: { clave?: unknown; claves?: unknown; tipo?: unknown };
  try {
    cuerpo = JSON.parse((await req.text()).slice(0, 4000));
  } catch {
    return new Response(null, { status: 400 });
  }
  const tipo = cuerpo.tipo === "pedido" ? "pedido" : cuerpo.tipo === "vista" ? "vista" : null;
  if (!tipo) return new Response(null, { status: 400 });
  const claves = (Array.isArray(cuerpo.claves) ? cuerpo.claves : [cuerpo.clave]).filter((c): c is string => typeof c === "string").slice(0, 30);
  for (const c of new Set(claves)) await registrarEvento(tienda, c, tipo);
  return new Response(null, { status: 204 });
}
