// Arma un escenario limpio: dos empresas, con negocios y usuarios de cada rol.
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto, type Contexto } from "@/lib/datos/contexto";
import type { Rol } from "@/generated/prisma/enums";

export async function limpiarBase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "DetalleDevolucion", "Devolucion", "PagoVenta", "DetalleVenta", "Venta", "Caja", "Cliente", "Auditoria", "MovimientoInventario", "Producto", "Categoria", "UsuarioNegocio", "Usuario", "Negocio", "Empresa" RESTART IDENTITY CASCADE',
  );
}

async function crearUsuario(empresaId: string, usuario: string, rol: Rol, negocios: string[]) {
  const u = await prisma.usuario.create({
    data: { empresaId, usuario, nombre: usuario, rol, hashContrasena: "x" },
  });
  if (negocios.length) {
    await prisma.usuarioNegocio.createMany({
      data: negocios.map((negocioId) => ({ empresaId, usuarioId: u.id, negocioId })),
    });
  }
  const ctx = await cargarContexto(u.id);
  if (!ctx) throw new Error(`No se pudo cargar el contexto de ${usuario}`);
  return ctx;
}

export type Escenario = Awaited<ReturnType<typeof crearEscenario>>;

export async function crearEscenario() {
  await limpiarBase();

  const camila = await prisma.empresa.create({ data: { nombre: "Camila" } });
  const motos = await prisma.negocio.create({ data: { empresaId: camila.id, nombre: "Repuestos de moto" } });
  const ferreteria = await prisma.negocio.create({ data: { empresaId: camila.id, nombre: "Ferretería" } });

  const otra = await prisma.empresa.create({ data: { nombre: "Otra Empresa" } });
  const tiendaOtra = await prisma.negocio.create({ data: { empresaId: otra.id, nombre: "Tienda de otra" } });

  const ctx: Record<string, Contexto> = {
    admin: await crearUsuario(camila.id, "admin", "ADMINISTRADOR", []),
    socio: await crearUsuario(camila.id, "socio", "SOCIO", [ferreteria.id]),
    cajero: await crearUsuario(camila.id, "cajero", "CAJERO", [motos.id]),
    adminOtra: await crearUsuario(otra.id, "admin-otra", "ADMINISTRADOR", []),
  };

  return { camila, motos, ferreteria, otra, tiendaOtra, ctx };
}
