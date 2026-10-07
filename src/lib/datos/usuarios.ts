// Gestión de usuarios de la empresa. Solo el administrador crea, edita,
// desactiva y restablece contraseñas; cada persona cambia la suya.
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Rol } from "@/generated/prisma/enums";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { AccesoDenegado, datosDe } from "./alcance";
import { cifrarContrasena } from "./autenticacion";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { registrarAuditoria, type Resultado, type Tx } from "./inventario";

export const ROLES_EMPRESA = ["ADMINISTRADOR", "SOCIO", "CAJERO"] as const;
export type RolEmpresa = (typeof ROLES_EMPRESA)[number];

export const ROLES: Record<RolEmpresa, { nombre: string; descripcion: string }> = {
  ADMINISTRADOR: { nombre: "Administrador", descripcion: "Todo, en todos los negocios. Maneja los usuarios." },
  SOCIO: { nombre: "Socio", descripcion: "Todo, pero solo en los negocios que se le asignen." },
  CAJERO: { nombre: "Cajero", descripcion: "Vende, da descuentos, anula ventas y consulta inventario. No ve costos ni cifras." },
};

export const OPCIONES_ROL = ROLES_EMPRESA.map((valor) => ({ valor, ...ROLES[valor] }));

export function exigirAdministrador(ctx: Pick<Contexto, "rol">) {
  if (ctx.rol !== "ADMINISTRADOR") throw new AccesoDenegado("solo el administrador maneja usuarios");
}

export type UsuarioVista = {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
  activo: boolean;
  negocios: { id: string; nombre: string }[];
  debeCambiarContrasena: boolean;
  bloqueado: boolean;
};

export async function listarUsuarios(ctx: Contexto, ahora = new Date()): Promise<UsuarioVista[]> {
  exigirAdministrador(ctx);
  const datos = datosDe(ctx);
  const [usuarios, asignaciones, negocios] = await Promise.all([
    datos.usuario.findMany({
      where: { rol: { in: [...ROLES_EMPRESA] } },
      select: {
        id: true,
        nombre: true,
        usuario: true,
        rol: true,
        activo: true,
        debeCambiarContrasena: true,
        bloqueadoHasta: true,
      },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    }),
    datos.usuarioNegocio.findMany({ select: { usuarioId: true, negocioId: true } }),
    datos.negocio.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  return usuarios.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    usuario: u.usuario,
    rol: u.rol,
    activo: u.activo,
    debeCambiarContrasena: u.debeCambiarContrasena,
    bloqueado: !!u.bloqueadoHasta && u.bloqueadoHasta > ahora,
    negocios:
      u.rol === "ADMINISTRADOR"
        ? negocios
        : negocios.filter((n) => asignaciones.some((a) => a.usuarioId === u.id && a.negocioId === n.id)),
  }));
}

export async function obtenerUsuario(ctx: Contexto, id: string) {
  const lista = await listarUsuarios(ctx);
  return lista.find((u) => u.id === id) ?? null;
}

const contrasena = z
  .string()
  .min(8, "La contraseña debe tener mínimo 8 caracteres.")
  .max(100, "La contraseña es demasiado larga.");

const datosBase = {
  nombre: z.string().trim().min(2, "Escribe el nombre de la persona.").max(80, "Máximo 80 caracteres."),
  rol: z.enum(ROLES_EMPRESA, { message: "Elige un rol." }),
  negocios: z.array(z.string().min(1)).max(50),
};

export const esquemaNuevoUsuario = z.object({
  ...datosBase,
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "El usuario debe tener mínimo 3 letras.")
    .max(30, "Máximo 30 caracteres.")
    .regex(/^[a-z0-9._-]+$/, "Usa solo letras sin tilde, números, punto o guion. Sin espacios."),
  contrasena,
});

export const esquemaEdicionUsuario = z.object(datosBase);

/** Revisa que los negocios elegidos sean de la empresa y que el rol los necesite. */
function validarNegocios(ctx: Contexto, rol: RolEmpresa, negocios: string[]): string[] | string {
  if (rol === "ADMINISTRADOR") return [];
  const unicos = [...new Set(negocios)];
  if (unicos.length === 0) return "Elige al menos un negocio.";
  if (unicos.some((n) => !ctx.negociosPermitidos.includes(n))) throw new AccesoDenegado("negocio de otra empresa");
  return unicos;
}

async function nombresNegocios(tx: Tx, ctx: Contexto, ids: string[]) {
  if (!ids.length) return ["Todos"];
  const negocios = await tx.negocio.findMany({
    where: { empresaId: ctx.empresaId, id: { in: ids } },
    select: { nombre: true },
    orderBy: { nombre: "asc" },
  });
  return negocios.map((n) => n.nombre);
}

async function administradoresActivos(tx: Tx, ctx: Contexto) {
  return tx.usuario.count({ where: { empresaId: ctx.empresaId, rol: "ADMINISTRADOR", activo: true } });
}

class ErrorUsuario extends Error {}

async function usuarioDeLaEmpresa(tx: Tx, ctx: Contexto, id: string) {
  const u = await tx.usuario.findFirst({ where: { id, empresaId: ctx.empresaId, rol: { in: [...ROLES_EMPRESA] } } });
  if (!u) throw new ErrorUsuario("No encontramos ese usuario.");
  return u;
}

export async function crearUsuario(ctx: Contexto, entrada: unknown): Promise<Resultado> {
  exigirAdministrador(ctx);
  const datos = esquemaNuevoUsuario.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const d = datos.data;
  const negocios = validarNegocios(ctx, d.rol, d.negocios);
  if (typeof negocios === "string") return { ok: false, error: negocios, campos: { negocios } };

  // El usuario es único en todo el sistema, no solo en la empresa.
  const existe = await prisma.usuario.findUnique({ where: { usuario: d.usuario }, select: { id: true } });
  if (existe) {
    const mensaje = "Ese usuario ya existe. Prueba con otro, por ejemplo agregándole el nombre del local.";
    return { ok: false, error: mensaje, campos: { usuario: mensaje } };
  }
  const hash = await cifrarContrasena(d.contrasena);

  try {
    const id = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.create({
        data: {
          empresaId: ctx.empresaId,
          usuario: d.usuario,
          nombre: d.nombre,
          rol: d.rol,
          hashContrasena: hash,
          debeCambiarContrasena: true,
        },
      });
      if (negocios.length) {
        await tx.usuarioNegocio.createMany({
          data: negocios.map((negocioId) => ({ empresaId: ctx.empresaId, usuarioId: u.id, negocioId })),
        });
      }
      await registrarAuditoria(tx, ctx, {
        negocioId: null,
        accion: "CREACION_USUARIO",
        entidad: "Usuario",
        entidadId: u.id,
        detalle: { nombre: d.nombre, usuario: d.usuario, rol: d.rol, negocios: await nombresNegocios(tx, ctx, negocios) },
      });
      return u.id;
    });
    return { ok: true, id };
  } catch (error) {
    // Dos administradores creando el mismo usuario al mismo tiempo.
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, error: "Ese usuario ya existe. Prueba con otro.", campos: { usuario: "Ese usuario ya existe." } };
    }
    throw error;
  }
}

export async function editarUsuario(ctx: Contexto, id: string, entrada: unknown): Promise<Resultado> {
  exigirAdministrador(ctx);
  const datos = esquemaEdicionUsuario.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const d = datos.data;
  const negocios = validarNegocios(ctx, d.rol, d.negocios);
  if (typeof negocios === "string") return { ok: false, error: negocios, campos: { negocios } };

  try {
    await prisma.$transaction(async (tx) => {
      const u = await usuarioDeLaEmpresa(tx, ctx, id);
      if (u.id === ctx.usuarioId && d.rol !== u.rol) throw new ErrorUsuario("No puedes cambiar tu propio rol.");
      if (u.rol === "ADMINISTRADOR" && d.rol !== "ADMINISTRADOR" && u.activo && (await administradoresActivos(tx, ctx)) <= 1) {
        throw new ErrorUsuario("La empresa debe tener al menos un administrador activo.");
      }
      const antes = await tx.usuarioNegocio.findMany({ where: { usuarioId: id }, select: { negocioId: true } });
      await tx.usuario.update({ where: { id }, data: { nombre: d.nombre, rol: d.rol } });
      await tx.usuarioNegocio.deleteMany({ where: { usuarioId: id } });
      if (negocios.length) {
        await tx.usuarioNegocio.createMany({
          data: negocios.map((negocioId) => ({ empresaId: ctx.empresaId, usuarioId: id, negocioId })),
        });
      }
      const negociosAntes = u.rol === "ADMINISTRADOR" ? [] : antes.map((a) => a.negocioId);
      await registrarAuditoria(tx, ctx, {
        negocioId: null,
        accion: "EDICION_USUARIO",
        entidad: "Usuario",
        entidadId: id,
        detalle: {
          nombre: d.nombre,
          antes: { nombre: u.nombre, rol: u.rol, negocios: await nombresNegocios(tx, ctx, negociosAntes) },
          despues: { nombre: d.nombre, rol: d.rol, negocios: await nombresNegocios(tx, ctx, negocios) },
        },
      });
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ErrorUsuario) return { ok: false, error: error.message };
    throw error;
  }
}

export async function cambiarEstadoUsuario(ctx: Contexto, id: string, activo: boolean): Promise<Resultado> {
  exigirAdministrador(ctx);
  try {
    await prisma.$transaction(async (tx) => {
      const u = await usuarioDeLaEmpresa(tx, ctx, id);
      if (u.activo === activo) return;
      if (!activo && u.id === ctx.usuarioId) throw new ErrorUsuario("No puedes desactivarte a ti mismo.");
      if (!activo && u.rol === "ADMINISTRADOR" && (await administradoresActivos(tx, ctx)) <= 1) {
        throw new ErrorUsuario("La empresa debe tener al menos un administrador activo.");
      }
      // Al desactivar, la versión sube y cualquier sesión abierta se cierra.
      await tx.usuario.update({
        where: { id },
        data: activo ? { activo } : { activo, versionSesion: { increment: 1 } },
      });
      await registrarAuditoria(tx, ctx, {
        negocioId: null,
        accion: activo ? "ACTIVACION_USUARIO" : "DESACTIVACION_USUARIO",
        entidad: "Usuario",
        entidadId: id,
        detalle: { nombre: u.nombre, usuario: u.usuario },
      });
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ErrorUsuario) return { ok: false, error: error.message };
    throw error;
  }
}

/** Contraseña temporal: la persona la debe cambiar al entrar. También la desbloquea. */
export async function restablecerContrasena(ctx: Contexto, id: string, nueva: unknown): Promise<Resultado> {
  exigirAdministrador(ctx);
  const datos = contrasena.safeParse(nueva);
  if (!datos.success) {
    const mensaje = datos.error.issues[0].message;
    return { ok: false, error: mensaje, campos: { contrasena: mensaje } };
  }
  if (id === ctx.usuarioId) return { ok: false, error: "Para cambiar tu propia contraseña usa Mi cuenta." };
  const hash = await cifrarContrasena(datos.data);
  try {
    await prisma.$transaction(async (tx) => {
      const u = await usuarioDeLaEmpresa(tx, ctx, id);
      await tx.usuario.update({
        where: { id },
        data: {
          hashContrasena: hash,
          debeCambiarContrasena: true,
          intentosFallidos: 0,
          bloqueadoHasta: null,
          versionSesion: { increment: 1 },
        },
      });
      await registrarAuditoria(tx, ctx, {
        negocioId: null,
        accion: "RESTABLECER_CONTRASENA",
        entidad: "Usuario",
        entidadId: id,
        detalle: { nombre: u.nombre, usuario: u.usuario },
      });
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ErrorUsuario) return { ok: false, error: error.message };
    throw error;
  }
}

export const esquemaMiContrasena = z
  .object({ actual: z.string().min(1, "Escribe tu contraseña actual.").max(200), nueva: contrasena, repetir: z.string() })
  .refine((d) => d.nueva === d.repetir, { message: "Las dos contraseñas no coinciden.", path: ["repetir"] })
  .refine((d) => d.nueva !== d.actual, { message: "La nueva debe ser distinta de la actual.", path: ["nueva"] });

/** Cada persona cambia su propia contraseña escribiendo la actual. */
export async function cambiarMiContrasena(ctx: Contexto, entrada: unknown): Promise<Resultado> {
  const datos = esquemaMiContrasena.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const u = await prisma.usuario.findFirst({
    where: { id: ctx.usuarioId, empresaId: ctx.empresaId },
    select: { hashContrasena: true },
  });
  if (!u) throw new AccesoDenegado("usuario no encontrado");
  if (!(await bcrypt.compare(datos.data.actual, u.hashContrasena))) {
    return {
      ok: false,
      error: "La contraseña actual no es correcta.",
      campos: { actual: "La contraseña actual no es correcta." },
    };
  }
  const hash = await cifrarContrasena(datos.data.nueva);
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: ctx.usuarioId }, data: { hashContrasena: hash, debeCambiarContrasena: false } });
    await registrarAuditoria(tx, ctx, {
      negocioId: null,
      accion: "CAMBIO_CONTRASENA",
      entidad: "Usuario",
      entidadId: ctx.usuarioId,
      detalle: { nombre: ctx.nombre },
    });
  });
  return { ok: true, id: ctx.usuarioId };
}

export const esquemaCrearContrasena = z
  .object({ nueva: contrasena, repetir: z.string() })
  .refine((d) => d.nueva === d.repetir, { message: "Las dos contraseñas no coinciden.", path: ["repetir"] });

/**
 * Primera entrada con contraseña temporal: la persona crea la suya sin volver a
 * escribir la temporal (la acaba de usar para entrar).
 */
export async function crearMiContrasena(ctx: Contexto, entrada: unknown): Promise<Resultado> {
  if (!ctx.debeCambiarContrasena) throw new AccesoDenegado("la contraseña no es temporal");
  const datos = esquemaCrearContrasena.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const u = await prisma.usuario.findFirst({
    where: { id: ctx.usuarioId, empresaId: ctx.empresaId },
    select: { hashContrasena: true },
  });
  if (!u) throw new AccesoDenegado("usuario no encontrado");
  if (await bcrypt.compare(datos.data.nueva, u.hashContrasena)) {
    const mensaje = "Escribe una contraseña distinta de la temporal.";
    return { ok: false, error: mensaje, campos: { nueva: mensaje } };
  }
  const hash = await cifrarContrasena(datos.data.nueva);
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: ctx.usuarioId }, data: { hashContrasena: hash, debeCambiarContrasena: false } });
    await registrarAuditoria(tx, ctx, {
      negocioId: null,
      accion: "CAMBIO_CONTRASENA",
      entidad: "Usuario",
      entidadId: ctx.usuarioId,
      detalle: { nombre: ctx.nombre },
    });
  });
  return { ok: true, id: ctx.usuarioId };
}
