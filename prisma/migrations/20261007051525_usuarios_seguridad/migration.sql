-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "bloqueadoHasta" TIMESTAMP(3),
ADD COLUMN     "debeCambiarContrasena" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "versionSesion" INTEGER NOT NULL DEFAULT 0;

