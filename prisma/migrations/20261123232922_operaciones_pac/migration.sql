-- CreateEnum
CREATE TYPE "TipoOperacionPac" AS ENUM ('RECARGA', 'RETIRO');

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "usaPac" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OperacionPac" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "tipo" "TipoOperacionPac" NOT NULL,
    "valor" INTEGER NOT NULL,
    "comision" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "nota" TEXT,
    "fecha" DATE NOT NULL,
    "cajaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperacionPac_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperacionPac_empresaId_idx" ON "OperacionPac"("empresaId");

-- CreateIndex
CREATE INDEX "OperacionPac_negocioId_fecha_idx" ON "OperacionPac"("negocioId", "fecha");

-- CreateIndex
CREATE INDEX "OperacionPac_cajaId_idx" ON "OperacionPac"("cajaId");

-- AddForeignKey
ALTER TABLE "OperacionPac" ADD CONSTRAINT "OperacionPac_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionPac" ADD CONSTRAINT "OperacionPac_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionPac" ADD CONSTRAINT "OperacionPac_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionPac" ADD CONSTRAINT "OperacionPac_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacionPac" ADD CONSTRAINT "OperacionPac_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
