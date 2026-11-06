-- AlterTable
ALTER TABLE "DetalleVenta" ADD COLUMN     "paquetes" DECIMAL(14,3),
ADD COLUMN     "porPresentacion" DECIMAL(14,3),
ADD COLUMN     "presentacion" TEXT;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "presentaciones" JSONB NOT NULL DEFAULT '[]';
