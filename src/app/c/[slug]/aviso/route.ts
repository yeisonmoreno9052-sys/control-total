import { crearAviso } from "@/lib/datos/catalogo-publico";
import { tiendaDe } from "../tienda";

/** "Avísame cuando llegue mi talla". Body: { clave, talla, color, cliente, telefono } */
export async function POST(req: Request, { params }: RouteContext<"/c/[slug]/aviso">) {
  const tienda = await tiendaDe((await params).slug);
  if (!tienda) return Response.json({ ok: false, error: "Este catálogo ya no está disponible." }, { status: 404 });
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse((await req.text()).slice(0, 4000));
  } catch {
    return Response.json({ ok: false, error: "Revisa los datos." }, { status: 400 });
  }
  const r = await crearAviso(tienda, cuerpo);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
