// Demo para un cliente: una empresa de prueba con el nombre del negocio del prospecto,
// un local de su tipo (motos, ferretería, cafetería o ropa) con productos de ejemplo y
// un mes de ventas, y su propio usuario. Así entra y desde el inicio lo ve como suyo.
//
// - Dura DIAS_PRUEBA días: después no deja entrar (ver autenticacion.ts y contexto.ts).
// - No cuenta como cliente ni suma mensualidades en el panel.
// - Si compra, "Convertir en cliente" borra los datos de ejemplo y deja su empresa,
//   su local y su usuario listos para cargar lo real.
import { randomInt } from "node:crypto";
import { z } from "zod";
import { NEGOCIOS_DEMO } from "@/lib/demo/catalogo";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { AccesoDenegado } from "./alcance";
import { cifrarContrasena } from "./autenticacion";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { armar } from "./demo";
import { borrarDatosDePrueba, contrasenaTemporal, type ContextoEmy } from "./emy";
import type { Resultado, Tx } from "./inventario";

/** Días que dura la demo de un cliente. */
export const DIAS_PRUEBA = 15;
/** Días de ventas de ejemplo con los que arranca. */
const DIAS_HISTORIA = 30;

/** Tipos de negocio que se pueden escoger, con la clave que viaja en el formulario. */
export const TIPOS_DEMO = NEGOCIOS_DEMO.map((n) => ({ clave: n.prefijo, nombre: n.tipo }));

function exigir(ce: ContextoEmy | null | undefined): asserts ce is ContextoEmy {
  if (!ce?.usuarioId) throw new AccesoDenegado("solo el superadmin de EMY TELECOM");
}

const texto = (max: number, mensaje: string) => z.string().trim().min(1, mensaje).max(max, `Máximo ${max} caracteres.`);

export const esquemaDemoCliente = z.object({
  negocio: texto(80, "Escribe el nombre del negocio."),
  persona: texto(60, "Escribe el nombre de la persona."),
  tipo: z.enum(NEGOCIOS_DEMO.map((n) => n.prefijo) as [string, ...string[]], { message: "Escoge el tipo de negocio." }),
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "El usuario debe tener al menos 3 letras.")
    .max(40, "Máximo 40 caracteres.")
    .regex(/^[a-z0-9._-]+$/, "Usa solo letras sin tilde, números, punto, guion o guion bajo (sin espacios)."),
  telefono: z
    .string()
    .trim()
    .max(30, "Máximo 30 caracteres.")
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

const sumarDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * 86_400_000);

/** Varias demos a la vez se arman una tras otra, para no cargar la base. */
let armando: Promise<unknown> = Promise.resolve();

/** Crea la empresa de prueba del cliente y la llena con un mes de historia. Tarda alrededor de un minuto. */
export async function crearDemoCliente(
  ce: ContextoEmy,
  entrada: unknown,
  opciones: { ahora?: Date; dias?: number } = {},
): Promise<Resultado<{ id: string; usuario: string; contrasena: string }>> {
  const ahora = opciones.ahora ?? new Date();
  exigir(ce);
  const datos = esquemaDemoCliente.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const d = datos.data;
  const plantilla = NEGOCIOS_DEMO.find((n) => n.prefijo === d.tipo)!;
  const existe = await prisma.usuario.findUnique({ where: { usuario: d.usuario }, select: { id: true } });
  if (existe) {
    const mensaje = "Ese usuario ya existe. Prueba con otro, por ejemplo agregándole el nombre del negocio.";
    return { ok: false, error: mensaje, campos: { usuario: mensaje } };
  }

  const contrasena = contrasenaTemporal();
  const hash = await cifrarContrasena(contrasena);
  let creado: { empresaId: string; negocioId: string; usuarioId: string; modulos: Contexto["modulosActivos"] };
  try {
    creado = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nombre: d.negocio,
          telefono: d.telefono ?? null,
          mensualidad: 0,
          pruebaHasta: sumarDias(ahora, DIAS_PRUEBA),
          notasEmy: `Demo para ${d.persona} (${plantilla.tipo}).`,
        },
        select: { id: true, modulosActivos: true },
      });
      const negocio = await tx.negocio.create({
        data: {
          empresaId: empresa.id,
          nombre: d.negocio,
          tipo: plantilla.tipo,
          razonSocial: d.negocio,
          telefono: d.telefono ?? null,
          mensajeRecibo: "¡Gracias por su compra!",
          margenSugerido: plantilla.margen,
          ivaPorDefecto: plantilla.ivaPorDefecto ?? 19,
          botonesRapidos: plantilla.botonesRapidos ?? false,
          usaTallas: plantilla.usaTallas ?? false,
          aceptaTarjeta: plantilla.aceptaTarjeta ?? false,
        },
        select: { id: true },
      });
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          usuario: d.usuario,
          nombre: d.persona,
          rol: "ADMINISTRADOR",
          hashContrasena: hash,
          debeCambiarContrasena: true,
        },
        select: { id: true },
      });
      await tx.accionEmy.create({
        data: {
          usuarioId: ce.usuarioId,
          empresaId: empresa.id,
          accion: "CREAR_DEMO_CLIENTE",
          detalle: { nombre: d.negocio, persona: d.persona, tipo: plantilla.tipo, usuario: d.usuario, dias: DIAS_PRUEBA },
        },
      });
      return { empresaId: empresa.id, negocioId: negocio.id, usuarioId: usuario.id, modulos: empresa.modulosActivos };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, error: "Ese usuario ya existe. Prueba con otro.", campos: { usuario: "Ese usuario ya existe." } };
    }
    throw error;
  }

  // Los productos y las ventas de ejemplo quedan a nombre de la persona, como si ella hubiera vendido.
  const ctx: Contexto = {
    usuarioId: creado.usuarioId,
    nombre: d.persona,
    empresaId: creado.empresaId,
    rol: "ADMINISTRADOR",
    negociosPermitidos: [creado.negocioId],
    modulosActivos: creado.modulos,
    versionSesion: 0,
    debeCambiarContrasena: false,
    puedeCrearProductos: false,
    puedeRegistrarGastos: false,
  };
  const trabajo = armando.then(() =>
    armar(ctx, ctx, [{ id: creado.negocioId, demo: plantilla }], opciones.dias ?? DIAS_HISTORIA, randomInt(1, 1_000_000)),
  );
  armando = trabajo.catch(() => undefined);
  try {
    await trabajo;
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      error: "La empresa quedó creada pero no se alcanzaron a cargar los ejemplos. Ábrela desde Demos de clientes y avísale a soporte.",
    };
  }
  return { ok: true, id: creado.empresaId, usuario: d.usuario, contrasena };
}

class ErrorDemoCliente extends Error {}

async function demoDeCliente(tx: Tx, id: string) {
  const e = await tx.empresa.findUnique({ where: { id }, select: { id: true, nombre: true, pruebaHasta: true } });
  if (!e?.pruebaHasta) throw new ErrorDemoCliente("Esa empresa no es una demo de cliente.");
  return e as { id: string; nombre: string; pruebaHasta: Date };
}

async function comoResultado<T extends object>(trabajo: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await trabajo();
  } catch (error) {
    if (error instanceof ErrorDemoCliente) return { ok: false, error: error.message };
    throw error;
  }
}

/** Le da DIAS_PRUEBA días más, contados desde hoy si ya había vencido. */
export async function extenderDemoCliente(ce: ContextoEmy, id: string, ahora = new Date()): Promise<Resultado<{ id: string; pruebaHasta: Date }>> {
  exigir(ce);
  return comoResultado(() =>
    prisma.$transaction(async (tx) => {
      const e = await demoDeCliente(tx, id);
      const desde = e.pruebaHasta > ahora ? e.pruebaHasta : ahora;
      const pruebaHasta = sumarDias(desde, DIAS_PRUEBA);
      await tx.empresa.update({ where: { id }, data: { pruebaHasta } });
      await tx.accionEmy.create({
        data: {
          usuarioId: ce.usuarioId,
          empresaId: id,
          accion: "EXTENDER_DEMO_CLIENTE",
          detalle: { nombre: e.nombre, hasta: pruebaHasta.toISOString().slice(0, 10) },
        },
      });
      return { ok: true as const, id, pruebaHasta };
    }),
  );
}

/**
 * El prospecto compró: se borran los productos, ventas y demás datos de ejemplo, y quedan
 * su empresa, su local y su usuario (con la contraseña que ya creó). Pasa a ser cliente normal.
 */
export async function convertirDemoEnCliente(ce: ContextoEmy, id: string): Promise<Resultado<{ id: string; productos: number }>> {
  exigir(ce);
  return comoResultado(() =>
    prisma.$transaction(
      async (tx) => {
        const e = await demoDeCliente(tx, id);
        const productos = await borrarDatosDePrueba(tx, id);
        await tx.empresa.update({
          where: { id },
          data: { pruebaHasta: null, estadoSuscripcion: "ACTIVA", activo: true },
        });
        await tx.accionEmy.create({
          data: { usuarioId: ce.usuarioId, empresaId: id, accion: "CONVERTIR_DEMO_CLIENTE", detalle: { nombre: e.nombre, productos } },
        });
        return { ok: true as const, id, productos };
      },
      { timeout: 120_000 },
    ),
  );
}
