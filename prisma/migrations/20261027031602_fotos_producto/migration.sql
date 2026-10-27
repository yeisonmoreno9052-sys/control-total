-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "fotoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FotoProducto" (
    "productoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "datos" BYTEA NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FotoProducto_pkey" PRIMARY KEY ("productoId")
);

-- CreateIndex
CREATE INDEX "FotoProducto_empresaId_idx" ON "FotoProducto"("empresaId");

-- AddForeignKey
ALTER TABLE "FotoProducto" ADD CONSTRAINT "FotoProducto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoProducto" ADD CONSTRAINT "FotoProducto_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoProducto" ADD CONSTRAINT "FotoProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
