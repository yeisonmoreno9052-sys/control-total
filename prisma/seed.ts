// Datos iniciales para desarrollo: empresa Camila con dos negocios y tres
// usuarios de prueba. Se puede correr varias veces sin duplicar nada.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Rol } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const contrasena = process.env.SEED_CONTRASENA;
  if (!contrasena || contrasena.length < 8) {
    throw new Error("Define SEED_CONTRASENA en .env (mínimo 8 caracteres).");
  }
  const hash = await bcrypt.hash(contrasena, 12);

  const empresa =
    (await prisma.empresa.findFirst({ where: { nombre: "Camila" } })) ??
    (await prisma.empresa.create({ data: { nombre: "Camila" } }));

  async function negocio(nombre: string, tipo: string) {
    return (
      (await prisma.negocio.findFirst({ where: { empresaId: empresa.id, nombre } })) ??
      (await prisma.negocio.create({ data: { empresaId: empresa.id, nombre, tipo } }))
    );
  }
  const motos = await negocio("Repuestos de moto", "Repuestos de moto");
  const ferreteria = await negocio("Ferretería", "Ferretería");

  async function usuario(usuario: string, nombre: string, rol: Rol, negocios: string[]) {
    const u = await prisma.usuario.upsert({
      where: { usuario },
      update: { nombre, rol, hashContrasena: hash, empresaId: empresa.id, activo: true },
      create: { usuario, nombre, rol, hashContrasena: hash, empresaId: empresa.id },
    });
    await prisma.usuarioNegocio.deleteMany({ where: { usuarioId: u.id } });
    await prisma.usuarioNegocio.createMany({
      data: negocios.map((negocioId) => ({ empresaId: empresa.id, usuarioId: u.id, negocioId })),
    });
  }

  // El administrador ve todos los negocios sin asignación.
  await usuario("admin", "Camila", "ADMINISTRADOR", []);
  await usuario("socio", "Socio Ferretería", "SOCIO", [ferreteria.id]);
  await usuario("cajero", "Cajero Motos", "CAJERO", [motos.id]);

  console.log("Listo: empresa Camila, 2 negocios y usuarios admin, socio y cajero.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
