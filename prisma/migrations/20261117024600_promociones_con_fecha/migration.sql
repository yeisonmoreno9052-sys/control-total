-- CreateEnum
CREATE TYPE "TipoPromocion" AS ENUM ('PORCENTAJE', 'PRECIO');

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "promocionId" TEXT;

-- CreateTable
CREATE TABLE "Promocion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoPromocion" NOT NULL,
    "valor" INTEGER NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "incluidos" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promocion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promocion_empresaId_idx" ON "Promocion"("empresaId");

-- CreateIndex
CREATE INDEX "Promocion_negocioId_hasta_idx" ON "Promocion"("negocioId", "hasta");

-- CreateIndex
CREATE INDEX "Producto_promocionId_idx" ON "Producto"("promocionId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_promocionId_fkey" FOREIGN KEY ("promocionId") REFERENCES "Promocion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promocion" ADD CONSTRAINT "Promocion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promocion" ADD CONSTRAINT "Promocion_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
