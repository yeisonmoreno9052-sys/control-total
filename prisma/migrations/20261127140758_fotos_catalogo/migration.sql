-- CreateTable
CREATE TABLE "FotoCatalogo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "color" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "tipo" TEXT NOT NULL,
    "datos" BYTEA NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FotoCatalogo_negocioId_clave_idx" ON "FotoCatalogo"("negocioId", "clave");

-- CreateIndex
CREATE INDEX "FotoCatalogo_empresaId_idx" ON "FotoCatalogo"("empresaId");

-- AddForeignKey
ALTER TABLE "FotoCatalogo" ADD CONSTRAINT "FotoCatalogo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FotoCatalogo" ADD CONSTRAINT "FotoCatalogo_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
