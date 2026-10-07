import type { Modulo, Rol } from "@/generated/prisma/enums";
import { prisma } from "./cliente";

/** Lo que el servidor sabe del usuario que hace la petición. */
export type Contexto = {
  usuarioId: string;
  nombre: string;
  empresaId: string;
  rol: Rol;
  /** Negocios que el usuario puede ver. El administrador ve todos los de su empresa. */
  negociosPermitidos: string[];
  modulosActivos: Modulo[];
  /** Debe coincidir con la de la sesión; si no, la sesión se cerró desde otro lado. */
  versionSesion: number;
  /** Entró con una contraseña temporal y todavía no la ha cambiado. */
  debeCambiarContrasena: boolean;
};

/**
 * Arma el contexto de un usuario a partir de la base de datos.
 * Devuelve null si el usuario no existe, está inactivo, no tiene empresa
 * o su empresa está inactiva o suspendida.
 */
export async function cargarContexto(usuarioId: string): Promise<Contexto | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: {
      empresa: true,
      negocios: { where: { negocio: { activo: true } }, select: { negocioId: true } },
    },
  });

  if (!usuario || !usuario.activo || !usuario.empresa || !usuario.empresaId) return null;
  if (!usuario.empresa.activo || usuario.empresa.estadoSuscripcion !== "ACTIVA") return null;

  let negociosPermitidos: string[];
  if (usuario.rol === "ADMINISTRADOR") {
    const negocios = await prisma.negocio.findMany({
      where: { empresaId: usuario.empresaId, activo: true },
      select: { id: true },
      orderBy: { nombre: "asc" },
    });
    negociosPermitidos = negocios.map((n) => n.id);
  } else {
    negociosPermitidos = usuario.negocios.map((n) => n.negocioId);
  }

  return {
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    empresaId: usuario.empresaId,
    rol: usuario.rol,
    negociosPermitidos,
    modulosActivos: usuario.empresa.modulosActivos,
    versionSesion: usuario.versionSesion,
    debeCambiarContrasena: usuario.debeCambiarContrasena,
  };
}
