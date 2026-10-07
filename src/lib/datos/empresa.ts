import { exigirRol } from "@/lib/permisos";
import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";
import type { Resultado } from "./inventario";

/** Datos de la empresa del usuario para el encabezado y los recibos. */
export async function obtenerEmpresa(ctx: Contexto) {
  const empresa = await datosDe(ctx).empresa.findFirst({
    select: { id: true, nombre: true, logoTipo: true, actualizadoEn: true },
  });
  if (!empresa) return null;
  return {
    id: empresa.id,
    nombre: empresa.nombre,
    // La versión en la dirección hace que el navegador pida el logo nuevo cuando cambia.
    logoUrl: empresa.logoTipo ? `/api/logo?v=${empresa.actualizadoEn.getTime()}` : null,
  };
}

export async function obtenerLogo(ctx: Contexto) {
  const empresa = await datosDe(ctx).empresa.findFirst({ select: { logo: true, logoTipo: true } });
  if (!empresa?.logo || !empresa.logoTipo) return null;
  return { bytes: empresa.logo, tipo: empresa.logoTipo };
}

export const LOGO_MAXIMO = 300 * 1024;
const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"];

/** Solo el administrador cambia el logo: es de toda la empresa. */
export async function guardarLogo(ctx: Contexto, bytes: Uint8Array | null, tipo: string | null): Promise<Resultado> {
  exigirRol(ctx, ["ADMINISTRADOR"]);
  if (bytes) {
    if (!tipo || !TIPOS_LOGO.includes(tipo)) return { ok: false, error: "El logo debe ser una imagen PNG, JPG o WEBP." };
    if (bytes.byteLength > LOGO_MAXIMO) return { ok: false, error: "El logo pesa más de 300 KB. Usa una imagen más liviana." };
  }
  await datosDe(ctx).empresa.updateMany({
    data: { logo: bytes ? Buffer.from(bytes) : null, logoTipo: bytes ? tipo : null },
  });
  return { ok: true, id: ctx.empresaId };
}
