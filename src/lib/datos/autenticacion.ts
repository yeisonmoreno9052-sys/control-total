import bcrypt from "bcryptjs";
import { prisma } from "./cliente";

export const MAXIMO_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;

export type ResultadoIngreso =
  | { ok: true; id: string; nombre: string; versionSesion: number }
  | { ok: false; motivo: "incorrecto" | "bloqueado" };

/**
 * Verifica usuario y contraseña. Después de 5 intentos fallidos seguidos el
 * usuario queda bloqueado 15 minutos, aunque luego escriba bien la contraseña.
 * Es la única consulta que se hace sin sesión, por eso vive aquí.
 */
export async function verificarCredenciales(
  nombreUsuario: string,
  contrasena: string,
  ahora = new Date(),
): Promise<ResultadoIngreso> {
  const usuario = await prisma.usuario.findUnique({
    where: { usuario: nombreUsuario.trim().toLowerCase() },
    select: {
      id: true,
      nombre: true,
      hashContrasena: true,
      activo: true,
      empresaId: true,
      intentosFallidos: true,
      bloqueadoHasta: true,
      versionSesion: true,
    },
  });

  // Comparamos aunque el usuario no exista, para que la respuesta tarde lo mismo
  // y no se pueda adivinar qué usuarios existen.
  const hash = usuario?.hashContrasena ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Ko6kxaQa8vzOmAzZ8b0kbcR1W2Y0dS";
  const valida = await bcrypt.compare(contrasena, hash);

  // El superadmin (sin empresa) entra en la Fase 7.
  if (!usuario || !usuario.activo || !usuario.empresaId) return { ok: false, motivo: "incorrecto" };
  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora) return { ok: false, motivo: "bloqueado" };

  if (!valida) {
    const intentos = usuario.intentosFallidos + 1;
    const bloquear = intentos >= MAXIMO_INTENTOS;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: bloquear
        ? { intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60_000) }
        : { intentosFallidos: intentos },
    });
    if (bloquear) {
      await prisma.auditoria.create({
        data: {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "BLOQUEO_INGRESO",
          entidad: "Usuario",
          entidadId: usuario.id,
          detalle: { intentos: MAXIMO_INTENTOS, minutos: MINUTOS_BLOQUEO },
        },
      });
      return { ok: false, motivo: "bloqueado" };
    }
    return { ok: false, motivo: "incorrecto" };
  }

  if (usuario.intentosFallidos > 0 || usuario.bloqueadoHasta) {
    await prisma.usuario.update({ where: { id: usuario.id }, data: { intentosFallidos: 0, bloqueadoHasta: null } });
  }
  return { ok: true, id: usuario.id, nombre: usuario.nombre, versionSesion: usuario.versionSesion };
}

export function cifrarContrasena(contrasena: string) {
  return bcrypt.hash(contrasena, 12);
}
