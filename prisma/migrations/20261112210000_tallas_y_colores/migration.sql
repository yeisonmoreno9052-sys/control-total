-- Prendas con tallas y colores (almacenes de ropa).
ALTER TABLE "Negocio" ADD COLUMN "usaTallas" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Producto" ADD COLUMN "prendaId" TEXT,
ADD COLUMN "prenda" TEXT,
ADD COLUMN "talla" TEXT,
ADD COLUMN "color" TEXT;

CREATE INDEX "Producto_negocioId_prendaId_idx" ON "Producto"("negocioId", "prendaId");
