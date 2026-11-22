import "server-only";
import { headers } from "next/headers";

/**
 * Dirección pública de la app ("https://app.controltotalpos.com"), para armar links que se
 * comparten por WhatsApp o en un QR. Se puede fijar con URL_PUBLICA; si no, se toma de la
 * petición (Railway manda el dominio en x-forwarded-host).
 */
export async function urlPublica() {
  const fija = process.env.URL_PUBLICA?.trim().replace(/\/+$/, "");
  if (fija) return fija;
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}
