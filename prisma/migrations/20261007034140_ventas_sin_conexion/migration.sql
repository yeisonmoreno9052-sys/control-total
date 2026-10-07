-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "idLocal" TEXT,
ADD COLUMN     "notaSincronizacion" TEXT,
ADD COLUMN     "numeroProvisional" TEXT,
ADD COLUMN     "sinConexion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sincronizadaEn" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Venta_negocioId_idLocal_key" ON "Venta"("negocioId", "idLocal");

