import { obtenerLogo } from "@/lib/datos/empresa";
import { obtenerContexto } from "@/lib/sesion";

/** Logo de la empresa de quien pregunta. La dirección lleva ?v=… y cambia cuando cambia el logo. */
export async function GET() {
  const ctx = await obtenerContexto();
  const logo = await obtenerLogo(ctx);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.tipo,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
