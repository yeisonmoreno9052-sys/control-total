-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "catalogoActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogoMostrarCantidad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogoSlug" TEXT,
ADD COLUMN     "catalogoWhatsapp" TEXT;

-- CreateTable
CREATE TABLE "AvisoTalla" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "prendaId" TEXT,
    "productoId" TEXT,
    "nombre" TEXT NOT NULL,
    "talla" TEXT,
    "color" TEXT,
    "cliente" TEXT,
    "telefono" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avisadoEn" TIMESTAMP(3),

    CONSTRAINT "AvisoTalla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VistaCatalogo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "vistas" INTEGER NOT NULL DEFAULT 0,
    "pedidos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VistaCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvisoTalla_empresaId_idx" ON "AvisoTalla"("empresaId");

-- CreateIndex
CREATE INDEX "AvisoTalla_negocioId_prendaId_idx" ON "AvisoTalla"("negocioId", "prendaId");

-- CreateIndex
CREATE INDEX "AvisoTalla_negocioId_avisadoEn_idx" ON "AvisoTalla"("negocioId", "avisadoEn");

-- CreateIndex
CREATE INDEX "VistaCatalogo_empresaId_idx" ON "VistaCatalogo"("empresaId");

-- CreateIndex
CREATE INDEX "VistaCatalogo_negocioId_dia_idx" ON "VistaCatalogo"("negocioId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "VistaCatalogo_negocioId_clave_dia_key" ON "VistaCatalogo"("negocioId", "clave", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_catalogoSlug_key" ON "Negocio"("catalogoSlug");

-- AddForeignKey
ALTER TABLE "AvisoTalla" ADD CONSTRAINT "AvisoTalla_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoTalla" ADD CONSTRAINT "AvisoTalla_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VistaCatalogo" ADD CONSTRAINT "VistaCatalogo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VistaCatalogo" ADD CONSTRAINT "VistaCatalogo_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

