// Crea o actualiza el usuario superadmin de EMY TELECOM (el que entra al panel /emy)
// a partir de las variables SUPERADMIN_USUARIO y SUPERADMIN_CONTRASENA.
// Corre en cada arranque: si cambias la contraseña en Railway, queda cambiada al
// reiniciar y se cierran las sesiones abiertas.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const usuario = process.env.SUPERADMIN_USUARIO?.trim().toLowerCase();
  const contrasena = process.env.SUPERADMIN_CONTRASENA;
  if (!usuario || !contrasena) return;
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario))
    throw new Error("SUPERADMIN_USUARIO: usa solo letras sin tilde, números, punto o guion.");
  if (contrasena.length < 12) throw new Error("SUPERADMIN_CONTRASENA debe tener al menos 12 caracteres.");

  const existente = await prisma.usuario.findUnique({ where: { usuario } });
  if (existente && (existente.empresaId || existente.rol !== "SUPERADMIN")) {
    throw new Error(`El usuario "${usuario}" ya pertenece a un cliente. Elige otro SUPERADMIN_USUARIO.`);
  }
  if (!existente) {
    await prisma.usuario.create({
      data: { usuario, nombre: "EMY TELECOM", rol: "SUPERADMIN", hashContrasena: await bcrypt.hash(contrasena, 12) },
    });
    console.log(`Superadmin "${usuario}" creado.`);
    return;
  }
  if (!(await bcrypt.compare(contrasena, existente.hashContrasena)) || !existente.activo) {
    await prisma.usuario.update({
      where: { id: existente.id },
      data: {
        hashContrasena: await bcrypt.hash(contrasena, 12),
        activo: true,
        intentosFallidos: 0,
        bloqueadoHasta: null,
        versionSesion: { increment: 1 },
      },
    });
    console.log(`Contraseña del superadmin "${usuario}" actualizada.`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
