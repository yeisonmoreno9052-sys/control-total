-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "esDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mensualidad" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notasEmy" TEXT,
ADD COLUMN     "proximoPago" DATE;

-- CreateTable
CREATE TABLE "AccionEmy" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT,
    "accion" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccionEmy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccionEmy_empresaId_creadoEn_idx" ON "AccionEmy"("empresaId", "creadoEn");

-- CreateIndex
CREATE INDEX "AccionEmy_creadoEn_idx" ON "AccionEmy"("creadoEn");

-- AddForeignKey
ALTER TABLE "AccionEmy" ADD CONSTRAINT "AccionEmy_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccionEmy" ADD CONSTRAINT "AccionEmy_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
