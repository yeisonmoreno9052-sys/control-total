-- AlterEnum
ALTER TYPE "MedioPago" ADD VALUE 'CREDITO';

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "permiteCredito" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AbonoCredito" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "referencia" TEXT,
    "nota" TEXT,
    "cajaId" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbonoCredito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbonoCredito_empresaId_idx" ON "AbonoCredito"("empresaId");

-- CreateIndex
CREATE INDEX "AbonoCredito_negocioId_clienteId_idx" ON "AbonoCredito"("negocioId", "clienteId");

-- CreateIndex
CREATE INDEX "AbonoCredito_cajaId_idx" ON "AbonoCredito"("cajaId");

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoCredito" ADD CONSTRAINT "AbonoCredito_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
