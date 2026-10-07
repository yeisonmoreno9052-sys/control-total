import bcrypt from "bcryptjs";
import { prisma } from "./cliente";

/**
 * Verifica usuario y contraseña. Devuelve el id del usuario o null.
 * Es la única consulta que se hace sin sesión, por eso vive aquí.
 */
export async function verificarCredenciales(
  nombreUsuario: string,
  contrasena: string,
): Promise<{ id: string; nombre: string } | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { usuario: nombreUsuario.trim().toLowerCase() },
    select: { id: true, nombre: true, hashContrasena: true, activo: true, empresaId: true },
  });

  // Comparamos aunque el usuario no exista, para que la respuesta tarde lo mismo
  // y no se pueda adivinar qué usuarios existen.
  const hash = usuario?.hashContrasena ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Ko6kxaQa8vzOmAzZ8b0kbcR1W2Y0dS";
  const valida = await bcrypt.compare(contrasena, hash);

  // El superadmin (sin empresa) entra en la Fase 7.
  if (!usuario || !valida || !usuario.activo || !usuario.empresaId) return null;
  return { id: usuario.id, nombre: usuario.nombre };
}

export function cifrarContrasena(contrasena: string) {
  return bcrypt.hash(contrasena, 12);
}
