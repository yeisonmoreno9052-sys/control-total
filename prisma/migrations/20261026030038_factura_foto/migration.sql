-- AlterEnum
ALTER TYPE "Modulo" ADD VALUE 'FACTURA_FOTO';

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "limiteFotosMes" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "LecturaFactura" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "paginas" INTEGER NOT NULL,
    "exito" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "costoPesos" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LecturaFactura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LecturaFactura_empresaId_creadoEn_idx" ON "LecturaFactura"("empresaId", "creadoEn");

-- AddForeignKey
ALTER TABLE "LecturaFactura" ADD CONSTRAINT "LecturaFactura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LecturaFactura" ADD CONSTRAINT "LecturaFactura_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LecturaFactura" ADD CONSTRAINT "LecturaFactura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
