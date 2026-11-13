-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MedioPago" ADD VALUE 'TARJETA';
ALTER TYPE "MedioPago" ADD VALUE 'SISTECREDITO';

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "aceptaSistecredito" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aceptaTarjeta" BOOLEAN NOT NULL DEFAULT false;
