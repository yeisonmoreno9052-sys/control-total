import { exigirRol } from "@/lib/permisos";
import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";
import { prisma } from "./cliente";
import { registrarAuditoria, type Resultado } from "./inventario";

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

/** Tipo real de la imagen según sus primeros bytes (no se confía en lo que diga el navegador). */
function tipoDeImagen(b: Uint8Array) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Solo el administrador cambia el logo: es de toda la empresa. null lo quita. */
export async function guardarLogo(ctx: Contexto, bytes: Uint8Array | null): Promise<Resultado> {
  exigirRol(ctx, ["ADMINISTRADOR"]);
  let tipo: string | null = null;
  if (bytes) {
    if (bytes.byteLength > LOGO_MAXIMO) return { ok: false, error: "El logo pesa más de 300 KB. Usa una imagen más liviana." };
    tipo = tipoDeImagen(bytes);
    if (!tipo) return { ok: false, error: "El logo debe ser una imagen PNG, JPG o WEBP." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.empresa.update({
      where: { id: ctx.empresaId },
      data: { logo: bytes ? Buffer.from(bytes) : null, logoTipo: tipo },
    });
    await registrarAuditoria(tx, ctx, {
      negocioId: null,
      accion: "CAMBIO_LOGO",
      entidad: "Empresa",
      entidadId: ctx.empresaId,
      detalle: { quitado: !bytes },
    });
  });
  return { ok: true, id: ctx.empresaId };
}
