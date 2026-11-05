-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "puedeRegistrarGastos" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TurnoCaja" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "esperado" INTEGER NOT NULL,
    "contado" INTEGER NOT NULL,
    "diferencia" INTEGER NOT NULL,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TurnoCaja_empresaId_idx" ON "TurnoCaja"("empresaId");

-- CreateIndex
CREATE INDEX "TurnoCaja_cajaId_idx" ON "TurnoCaja"("cajaId");

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
