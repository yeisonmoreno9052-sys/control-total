-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "botonesRapidos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ivaPorDefecto" INTEGER NOT NULL DEFAULT 19;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "botonRapido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "controlaStock" BOOLEAN NOT NULL DEFAULT true;
