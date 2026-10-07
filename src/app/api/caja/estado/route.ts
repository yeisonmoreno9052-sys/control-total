import { connection } from "next/server";

/** Para saber si volvió el internet: responde si el servidor se alcanza. */
export async function GET() {
  await connection(); // siempre en vivo, nunca una respuesta guardada
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
