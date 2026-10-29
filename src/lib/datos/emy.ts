// Panel de EMY TELECOM: el superadmin crea clientes (empresas), los suspende,
// registra sus pagos y les da soporte.
//
// Reglas:
// - Solo entra un usuario SUPERADMIN sin empresa (cargarSuperadmin).
// - Desde aquí se ven cifras de uso de cada cliente (cuántos productos, ventas,
//   usuarios), nunca sus ventas, productos, costos ni utilidades.
// - Todo lo que se hace queda en AccionEmy.
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Modulo } from "@/generated/prisma/enums";
import { fechaDeHoy } from "@/lib/formato";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { esFondo } from "@/lib/fondos";
import { esPaleta } from "@/lib/paletas";
import { AccesoDenegado } from "./alcance";
import { cifrarContrasena } from "./autenticacion";
import { cuentaParaLimite, inicioDelMes } from "./lectura-factura";
import { prisma } from "./cliente";
import type { Resultado, Tx } from "./inventario";

export type ContextoEmy = { usuarioId: string; nombre: string; versionSesion: number };

/** El superadmin que hace la petición, o null si el usuario no lo es. */
export async function cargarSuperadmin(usuarioId: string): Promise<ContextoEmy | null> {
  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, nombre: true, rol: true, empresaId: true, activo: true, versionSesion: true },
  });
  if (!u || !u.activo || u.rol !== "SUPERADMIN" || u.empresaId) return null;
  return { usuarioId: u.id, nombre: u.nombre, versionSesion: u.versionSesion };
}

function exigir(ce: ContextoEmy | null | undefined): asserts ce is ContextoEmy {
  if (!ce?.usuarioId) throw new AccesoDenegado("solo el superadmin de EMY TELECOM");
}

async function registrarAccion(tx: Tx, ce: ContextoEmy, empresaId: string | null, accion: string, detalle: object) {
  await tx.accionEmy.create({ data: { usuarioId: ce.usuarioId, empresaId, accion, detalle } });
}

export const MODULOS: { valor: Modulo; nombre: string }[] = [
  { valor: "INVENTARIO", nombre: "Inventario" },
  { valor: "VENTAS", nombre: "Ventas y caja" },
  { valor: "PROVEEDORES", nombre: "Proveedores y compras" },
  { valor: "CAJA", nombre: "Ingresos, egresos y cierres" },
  { valor: "REPORTES", nombre: "Reportes" },
  { valor: "FACTURA_FOTO", nombre: "Facturas con foto (IA, se cobra aparte)" },
];

// ─── Contraseñas temporales ─────────────────────────────────────────────────

// Sin letras que se confunden al dictarlas (0/O, 1/l/I).
const LETRAS = "abcdefghjkmnpqrstuvwxyz";
const NUMEROS = "23456789";

/** Contraseña temporal fácil de dictar por teléfono: "mesa-4827-ruta". */
export function contrasenaTemporal() {
  const palabra = (n: number) => Array.from({ length: n }, () => LETRAS[randomInt(LETRAS.length)]).join("");
  const numero = Array.from({ length: 4 }, () => NUMEROS[randomInt(NUMEROS.length)]).join("");
  return `${palabra(4)}-${numero}-${palabra(4)}`;
}

// ─── Fechas de pago ─────────────────────────────────────────────────────────

/** Mismo día del mes siguiente (31 de enero → 28 o 29 de febrero). */
export function sumarUnMes(fecha: Date) {
  const a = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth() + 1;
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m, Math.min(fecha.getUTCDate(), ultimo)));
}

export type EstadoPago = "al_dia" | "vence_pronto" | "vencido" | "sin_fecha";

/** Vencido si ya pasó el día de pago; "pronto" si faltan 5 días o menos. */
export function estadoPago(proximoPago: Date | null, hoy = fechaDeHoy()): EstadoPago {
  if (!proximoPago) return "sin_fecha";
  const dias = Math.round((proximoPago.getTime() - hoy.getTime()) / 86_400_000);
  if (dias < 0) return "vencido";
  if (dias <= 5) return "vence_pronto";
  return "al_dia";
}

// ─── Consultas ──────────────────────────────────────────────────────────────

export type ClienteFila = {
  id: string;
  nombre: string;
  nit: string | null;
  telefono: string | null;
  activa: boolean;
  esDemo: boolean;
  mensualidad: number;
  proximoPago: Date | null;
  estadoPago: EstadoPago;
  locales: number;
  usuarios: number;
  productos: number;
  ventas30Dias: number;
  ultimaVenta: Date | null;
  creadoEn: Date;
};

const conteo = (filas: { empresaId: string; _count: { _all: number } }[]) =>
  new Map(filas.map((f) => [f.empresaId, f._count._all]));

/** Todos los clientes con sus cifras de uso (sin datos de su negocio). */
export async function listarClientes(ce: ContextoEmy, ahora = new Date()): Promise<ClienteFila[]> {
  exigir(ce);
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000);
  const [empresas, locales, usuarios, productos, ventas, ultimas] = await Promise.all([
    prisma.empresa.findMany({
      orderBy: [{ esDemo: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        nit: true,
        telefono: true,
        activo: true,
        estadoSuscripcion: true,
        esDemo: true,
        mensualidad: true,
        proximoPago: true,
        creadoEn: true,
      },
    }),
    prisma.negocio.groupBy({ by: ["empresaId"], where: { activo: true }, _count: { _all: true } }),
    prisma.usuario.groupBy({ by: ["empresaId"], where: { activo: true, empresaId: { not: null } }, _count: { _all: true } }),
    prisma.producto.groupBy({ by: ["empresaId"], where: { activo: true }, _count: { _all: true } }),
    prisma.venta.groupBy({ by: ["empresaId"], where: { creadoEn: { gte: hace30 } }, _count: { _all: true } }),
    prisma.venta.groupBy({ by: ["empresaId"], _max: { creadoEn: true } }),
  ]);
  const nLocales = conteo(locales);
  const nUsuarios = conteo(usuarios as { empresaId: string; _count: { _all: number } }[]);
  const nProductos = conteo(productos);
  const nVentas = conteo(ventas);
  const ultima = new Map(ultimas.map((u) => [u.empresaId, u._max.creadoEn]));
  const hoy = fechaDeHoy(ahora);
  return empresas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    nit: e.nit,
    telefono: e.telefono,
    activa: e.activo && e.estadoSuscripcion === "ACTIVA",
    esDemo: e.esDemo,
    mensualidad: e.mensualidad,
    proximoPago: e.proximoPago,
    estadoPago: e.esDemo ? "sin_fecha" : estadoPago(e.proximoPago, hoy),
    locales: nLocales.get(e.id) ?? 0,
    usuarios: nUsuarios.get(e.id) ?? 0,
    productos: nProductos.get(e.id) ?? 0,
    ventas30Dias: nVentas.get(e.id) ?? 0,
    ultimaVenta: ultima.get(e.id) ?? null,
    creadoEn: e.creadoEn,
  }));
}

/** Cifras para la cabecera del panel. La demo no cuenta como cliente. */
export function resumirClientes(clientes: ClienteFila[]) {
  const reales = clientes.filter((c) => !c.esDemo);
  const activos = reales.filter((c) => c.activa);
  return {
    activos: activos.length,
    suspendidos: reales.length - activos.length,
    mensualidades: activos.reduce((s, c) => s + c.mensualidad, 0),
    vencidos: activos.filter((c) => c.estadoPago === "vencido").length,
  };
}

export async function obtenerCliente(ce: ContextoEmy, id: string) {
  exigir(ce);
  const empresa = await prisma.empresa.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      nit: true,
      telefono: true,
      correo: true,
      direccion: true,
      activo: true,
      estadoSuscripcion: true,
      modulosActivos: true,
      mensualidad: true,
      proximoPago: true,
      notasEmy: true,
      esDemo: true,
      limiteFotosMes: true,
      paleta: true,
      fondo: true,
      creadoEn: true,
    },
  });
  if (!empresa) return null;
  const [locales, usuarios, acciones, fotos] = await Promise.all([
    prisma.negocio.findMany({
      where: { empresaId: id },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, direccion: true, tipo: true, activo: true },
    }),
    prisma.usuario.findMany({
      where: { empresaId: id },
      orderBy: [{ rol: "asc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        usuario: true,
        rol: true,
        activo: true,
        bloqueadoHasta: true,
        debeCambiarContrasena: true,
      },
    }),
    prisma.accionEmy.findMany({
      where: { empresaId: id },
      orderBy: { creadoEn: "desc" },
      take: 30,
      select: { id: true, accion: true, detalle: true, creadoEn: true, usuario: { select: { nombre: true } } },
    }),
    prisma.lecturaFactura.aggregate({
      where: { empresaId: id, creadoEn: { gte: inicioDelMes() }, ...cuentaParaLimite },
      _count: true,
      _sum: { costoPesos: true },
    }),
  ]);
  return {
    ...empresa,
    activa: empresa.activo && empresa.estadoSuscripcion === "ACTIVA",
    locales,
    usuarios,
    acciones,
    fotosMes: { usadas: fotos._count, costo: fotos._sum.costoPesos ?? 0 },
  };
}

// ─── Crear un cliente ───────────────────────────────────────────────────────

const texto = (max: number, mensaje: string) => z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres.`);
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => v || null)
    .nullable()
    .optional();
const pesosEnteros = z.coerce
  .number({ message: "Escribe un valor en pesos." })
  .int("Escribe un valor en pesos, sin centavos.")
  .min(0, "No puede ser negativo.")
  .max(100_000_000, "Revisa el valor.");
const dia = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Revisa la fecha.")
  .nullable()
  .optional();
const nombreUsuario = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "El usuario debe tener al menos 3 letras.")
  .max(40, "Máximo 40 caracteres.")
  .regex(/^[a-z0-9._-]+$/, "Usa solo letras sin tilde, números, punto, guion o guion bajo (sin espacios).");

const esquemaDatosCliente = z.object({
  nombre: texto(120, "Escribe el nombre de la empresa."),
  nit: opcional(30),
  telefono: opcional(30),
  correo: opcional(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Revisa el correo."),
  direccion: opcional(200),
  mensualidad: pesosEnteros,
  proximoPago: dia,
  notasEmy: opcional(1000),
});

const esquemaLocal = z.object({
  nombre: texto(80, "Escribe el nombre del local."),
  direccion: opcional(200),
  tipo: opcional(60),
});

export const esquemaNuevoCliente = esquemaDatosCliente.extend({
  locales: z.array(esquemaLocal).min(1, "Agrega al menos un local.").max(20, "Máximo 20 locales."),
  adminNombre: texto(80, "Escribe el nombre del administrador."),
  adminUsuario: nombreUsuario,
});

const aFecha = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

export async function crearCliente(
  ce: ContextoEmy,
  entrada: unknown,
): Promise<Resultado<{ id: string; usuario: string; contrasena: string }>> {
  exigir(ce);
  const datos = esquemaNuevoCliente.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const d = datos.data;
  const nombres = d.locales.map((l) => l.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) {
    return {
      ok: false,
      error: "Dos locales tienen el mismo nombre.",
      campos: { locales: "Cada local debe tener un nombre distinto." },
    };
  }
  const existe = await prisma.usuario.findUnique({ where: { usuario: d.adminUsuario }, select: { id: true } });
  if (existe) {
    const mensaje = "Ese usuario ya existe. Prueba con otro, por ejemplo agregándole el nombre del negocio.";
    return { ok: false, error: mensaje, campos: { adminUsuario: mensaje } };
  }
  const contrasena = contrasenaTemporal();
  const hash = await cifrarContrasena(contrasena);
  try {
    const id = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nombre: d.nombre,
          nit: d.nit ?? null,
          telefono: d.telefono ?? null,
          correo: d.correo ?? null,
          direccion: d.direccion ?? null,
          mensualidad: d.mensualidad,
          proximoPago: aFecha(d.proximoPago),
          notasEmy: d.notasEmy ?? null,
        },
      });
      await tx.negocio.createMany({
        data: d.locales.map((l) => ({
          empresaId: empresa.id,
          nombre: l.nombre,
          direccion: l.direccion ?? null,
          tipo: l.tipo ?? null,
        })),
      });
      await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          usuario: d.adminUsuario,
          nombre: d.adminNombre,
          rol: "ADMINISTRADOR",
          hashContrasena: hash,
          debeCambiarContrasena: true,
        },
      });
      await registrarAccion(tx, ce, empresa.id, "CREAR_CLIENTE", {
        nombre: d.nombre,
        locales: d.locales.map((l) => l.nombre),
        administrador: d.adminUsuario,
        mensualidad: d.mensualidad,
      });
      return empresa.id;
    });
    return { ok: true, id, usuario: d.adminUsuario, contrasena };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, error: "Ese usuario ya existe. Prueba con otro.", campos: { adminUsuario: "Ese usuario ya existe." } };
    }
    throw error;
  }
}

// ─── Editar un cliente ──────────────────────────────────────────────────────

async function clienteReal(tx: Tx, id: string) {
  const e = await tx.empresa.findUnique({ where: { id }, select: { id: true, nombre: true, esDemo: true, proximoPago: true } });
  if (!e) throw new ErrorEmy("No encontramos ese cliente.");
  return e;
}

class ErrorEmy extends Error {}

async function comoResultado<T extends object>(trabajo: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await trabajo();
  } catch (error) {
    if (error instanceof ErrorEmy) return { ok: false, error: error.message };
    throw error;
  }
}

export async function editarCliente(ce: ContextoEmy, id: string, entrada: unknown): Promise<Resultado> {
  exigir(ce);
  const datos = esquemaDatosCliente.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const d = datos.data;
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      await clienteReal(tx, id);
      await tx.empresa.update({
        where: { id },
        data: {
          nombre: d.nombre,
          nit: d.nit ?? null,
          telefono: d.telefono ?? null,
          correo: d.correo ?? null,
          direccion: d.direccion ?? null,
          mensualidad: d.mensualidad,
          proximoPago: aFecha(d.proximoPago),
          notasEmy: d.notasEmy ?? null,
        },
      });
      await registrarAccion(tx, ce, id, "EDITAR_CLIENTE", {
        nombre: d.nombre,
        mensualidad: d.mensualidad,
        proximoPago: d.proximoPago ?? null,
      });
      return { ok: true as const, id };
    }),
  );
}

/** Suspender cierra el acceso de todos sus usuarios en la siguiente pantalla que abran. Los datos no se tocan. */
export async function cambiarEstadoCliente(ce: ContextoEmy, id: string, activa: boolean): Promise<Resultado> {
  exigir(ce);
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, id);
      await tx.empresa.update({ where: { id }, data: { estadoSuscripcion: activa ? "ACTIVA" : "SUSPENDIDA" } });
      await registrarAccion(tx, ce, id, activa ? "REACTIVAR_CLIENTE" : "SUSPENDER_CLIENTE", { nombre: e.nombre });
      return { ok: true as const, id };
    }),
  );
}

/** Marca la mensualidad como pagada: el próximo pago pasa al mes siguiente. */
export async function registrarPagoCliente(
  ce: ContextoEmy,
  id: string,
  hoy = fechaDeHoy(),
): Promise<Resultado<{ proximoPago: Date }>> {
  exigir(ce);
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, id);
      if (e.esDemo) throw new ErrorEmy("La empresa de demostración no paga mensualidad.");
      const proximoPago = sumarUnMes(e.proximoPago ?? hoy);
      await tx.empresa.update({ where: { id }, data: { proximoPago } });
      await registrarAccion(tx, ce, id, "REGISTRAR_PAGO", {
        nombre: e.nombre,
        pagoDel: e.proximoPago?.toISOString().slice(0, 10) ?? null,
        proximoPago: proximoPago.toISOString().slice(0, 10),
      });
      return { ok: true as const, proximoPago };
    }),
  );
}

export async function cambiarModulos(ce: ContextoEmy, id: string, modulos: unknown): Promise<Resultado> {
  exigir(ce);
  const validos = new Set(MODULOS.map((m) => m.valor));
  const lista = Array.isArray(modulos) ? [...new Set(modulos.filter((m): m is Modulo => validos.has(m as Modulo)))] : [];
  if (!lista.length) return { ok: false, error: "Deja al menos un módulo prendido." };
  const ordenados = MODULOS.map((m) => m.valor).filter((m) => lista.includes(m));
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, id);
      await tx.empresa.update({ where: { id }, data: { modulosActivos: ordenados } });
      await registrarAccion(tx, ce, id, "CAMBIAR_MODULOS", { nombre: e.nombre, modulos: ordenados });
      return { ok: true as const, id };
    }),
  );
}

/** Cuántas facturas con foto puede leer el cliente cada mes. */
export async function cambiarLimiteFotos(ce: ContextoEmy, id: string, limite: unknown): Promise<Resultado> {
  exigir(ce);
  const n = z.coerce.number().int().min(0).max(1000).safeParse(limite);
  if (!n.success) return { ok: false, error: "Escribe un número entre 0 y 1.000." };
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, id);
      await tx.empresa.update({ where: { id }, data: { limiteFotosMes: n.data } });
      await registrarAccion(tx, ce, id, "CAMBIAR_LIMITE_FOTOS", { nombre: e.nombre, limite: n.data });
      return { ok: true as const, id };
    }),
  );
}

/** Colores de la app del cliente. Solo cambia la apariencia, nunca los datos. */
export async function cambiarPaleta(ce: ContextoEmy, id: string, paleta: unknown): Promise<Resultado> {
  exigir(ce);
  if (!esPaleta(paleta)) return { ok: false, error: "Escoge una de las paletas de la lista." };
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, id);
      await tx.empresa.update({ where: { id }, data: { paleta } });
      await registrarAccion(tx, ce, id, "CAMBIAR_PALETA", { nombre: e.nombre, paleta });
      return { ok: true as const, id };
    }),
  );
}

/** Imagen suave en la franja del Inicio del cliente; null la quita. Solo apariencia. */
export async function cambiarFondo(ce: ContextoEmy, id: string, fondo: unknown): Promise<Resultado> {
  exigir(ce);
  if (fondo !== null && !esFondo(fondo)) return { ok: false, error: "Escoge una de las imágenes de la lista." };
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, id);
      await tx.empresa.update({ where: { id }, data: { fondo } });
      await registrarAccion(tx, ce, id, "CAMBIAR_FONDO", { nombre: e.nombre, fondo });
      return { ok: true as const, id };
    }),
  );
}

export async function agregarLocal(ce: ContextoEmy, empresaId: string, entrada: unknown): Promise<Resultado> {
  exigir(ce);
  const datos = esquemaLocal.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const d = datos.data;
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, empresaId);
      const repetido = await tx.negocio.findFirst({
        where: { empresaId, nombre: { equals: d.nombre, mode: "insensitive" } },
        select: { id: true },
      });
      if (repetido) throw new ErrorEmy("Ya hay un local con ese nombre en esta empresa.");
      const n = await tx.negocio.create({
        data: { empresaId, nombre: d.nombre, direccion: d.direccion ?? null, tipo: d.tipo ?? null },
      });
      await registrarAccion(tx, ce, empresaId, "AGREGAR_LOCAL", { nombre: e.nombre, local: d.nombre });
      return { ok: true as const, id: n.id };
    }),
  );
}

/**
 * Soporte: el cliente olvidó su contraseña. Se le pone una temporal (que debe cambiar
 * al entrar), se desbloquea y se cierran sus sesiones abiertas.
 */
export async function restablecerContrasenaCliente(
  ce: ContextoEmy,
  empresaId: string,
  usuarioId: string,
): Promise<Resultado<{ id: string; usuario: string; contrasena: string }>> {
  exigir(ce);
  const contrasena = contrasenaTemporal();
  const hash = await cifrarContrasena(contrasena);
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await clienteReal(tx, empresaId);
      const u = await tx.usuario.findFirst({
        where: { id: usuarioId, empresaId },
        select: { id: true, usuario: true, nombre: true },
      });
      if (!u) throw new ErrorEmy("No encontramos ese usuario en este cliente.");
      await tx.usuario.update({
        where: { id: u.id },
        data: {
          hashContrasena: hash,
          debeCambiarContrasena: true,
          intentosFallidos: 0,
          bloqueadoHasta: null,
          versionSesion: { increment: 1 },
        },
      });
      await registrarAccion(tx, ce, empresaId, "RESTABLECER_CONTRASENA", { nombre: e.nombre, usuario: u.usuario });
      return { ok: true as const, id: u.id, usuario: u.usuario, contrasena };
    }),
  );
}

export const NOMBRE_ACCION: Record<string, string> = {
  CREAR_CLIENTE: "Creó el cliente",
  EDITAR_CLIENTE: "Editó los datos",
  SUSPENDER_CLIENTE: "Suspendió el cliente",
  REACTIVAR_CLIENTE: "Reactivó el cliente",
  REGISTRAR_PAGO: "Registró un pago",
  CAMBIAR_MODULOS: "Cambió los módulos",
  CAMBIAR_LIMITE_FOTOS: "Cambió el límite de facturas con foto",
  CAMBIAR_PALETA: "Cambió los colores",
  CAMBIAR_FONDO: "Cambió la imagen del inicio",
  AGREGAR_LOCAL: "Agregó un local",
  RESTABLECER_CONTRASENA: "Restableció una contraseña",
  REINICIAR_DEMO: "Reinició la demo",
  BLOQUEO_INGRESO: "Bloqueo por intentos fallidos",
};
