-- Búsqueda por partes del nombre y del código (índices trigram).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('UNIDAD', 'METRO', 'CENTIMETRO', 'KILO', 'GRAMO', 'LIBRA', 'LITRO', 'GALON');

-- CreateEnum
CREATE TYPE "CondicionProducto" AS ENUM ('NUEVO', 'DE_SEGUNDA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('CREACION', 'AJUSTE', 'IMPORTACION', 'COMPRA', 'VENTA', 'ANULACION', 'DEVOLUCION');

-- CreateEnum
CREATE TYPE "MotivoAjuste" AS ENUM ('CONTEO', 'DANO', 'PERDIDA', 'OTRO');

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "margenSugerido" DECIMAL(6,2) NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "margenSugerido" DECIMAL(6,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "codigo" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "costo" INTEGER NOT NULL DEFAULT 0,
    "precioVenta" INTEGER NOT NULL,
    "stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unidad" "UnidadMedida" NOT NULL DEFAULT 'UNIDAD',
    "fraccionado" BOOLEAN NOT NULL DEFAULT false,
    "porcentajeIva" INTEGER NOT NULL DEFAULT 0,
    "condicion" "CondicionProducto" NOT NULL DEFAULT 'NUEVO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "motivo" "MotivoAjuste",
    "nota" TEXT,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "stockAntes" DECIMAL(14,3) NOT NULL,
    "stockDespues" DECIMAL(14,3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Categoria_empresaId_idx" ON "Categoria"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_negocioId_nombre_key" ON "Categoria"("negocioId", "nombre");

-- CreateIndex
CREATE INDEX "Producto_empresaId_idx" ON "Producto"("empresaId");

-- CreateIndex
CREATE INDEX "Producto_negocioId_nombre_idx" ON "Producto"("negocioId", "nombre");

-- CreateIndex
CREATE INDEX "Producto_categoriaId_idx" ON "Producto"("categoriaId");

-- CreateIndex
CREATE INDEX "Producto_nombre_trgm_idx" ON "Producto" USING GIN ("nombre" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Producto_codigo_trgm_idx" ON "Producto" USING GIN ("codigo" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Producto_negocioId_codigo_key" ON "Producto"("negocioId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_negocioId_codigoBarras_key" ON "Producto"("negocioId", "codigoBarras");

-- CreateIndex
CREATE INDEX "MovimientoInventario_productoId_creadoEn_idx" ON "MovimientoInventario"("productoId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoInventario_negocioId_creadoEn_idx" ON "MovimientoInventario"("negocioId", "creadoEn");

-- CreateIndex
CREATE INDEX "MovimientoInventario_empresaId_idx" ON "MovimientoInventario"("empresaId");

-- CreateIndex
CREATE INDEX "Auditoria_empresaId_creadoEn_idx" ON "Auditoria"("empresaId", "creadoEn");

-- CreateIndex
CREATE INDEX "Auditoria_negocioId_creadoEn_idx" ON "Auditoria"("negocioId", "creadoEn");

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
