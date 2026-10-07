-- CreateEnum
CREATE TYPE "EstadoPagoFactura" AS ENUM ('PENDIENTE', 'ABONO_PARCIAL', 'PAGADA');

-- CreateEnum
CREATE TYPE "EstadoFacturaCompra" AS ENUM ('REGISTRADA', 'ANULADA');

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "correo" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaCompra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "vencimiento" DATE,
    "total" INTEGER NOT NULL,
    "pagado" INTEGER NOT NULL DEFAULT 0,
    "estadoPago" "EstadoPagoFactura" NOT NULL DEFAULT 'PENDIENTE',
    "estado" "EstadoFacturaCompra" NOT NULL DEFAULT 'REGISTRADA',
    "nota" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "motivoAnulacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleFacturaCompra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "costoUnitario" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "costoAntes" INTEGER NOT NULL,
    "costoDespues" INTEGER NOT NULL,
    "precioAntes" INTEGER NOT NULL,
    "precioDespues" INTEGER NOT NULL,

    CONSTRAINT "DetalleFacturaCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonoFactura" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
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

    CONSTRAINT "AbonoFactura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjuntoFactura" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjuntoFactura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proveedor_empresaId_idx" ON "Proveedor"("empresaId");

-- CreateIndex
CREATE INDEX "Proveedor_negocioId_nombre_idx" ON "Proveedor"("negocioId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_negocioId_nit_key" ON "Proveedor"("negocioId", "nit");

-- CreateIndex
CREATE INDEX "FacturaCompra_empresaId_idx" ON "FacturaCompra"("empresaId");

-- CreateIndex
CREATE INDEX "FacturaCompra_negocioId_fecha_idx" ON "FacturaCompra"("negocioId", "fecha");

-- CreateIndex
CREATE INDEX "FacturaCompra_negocioId_estado_vencimiento_idx" ON "FacturaCompra"("negocioId", "estado", "vencimiento");

-- CreateIndex
CREATE INDEX "FacturaCompra_proveedorId_numero_idx" ON "FacturaCompra"("proveedorId", "numero");

-- CreateIndex
CREATE INDEX "DetalleFacturaCompra_facturaId_idx" ON "DetalleFacturaCompra"("facturaId");

-- CreateIndex
CREATE INDEX "DetalleFacturaCompra_productoId_idx" ON "DetalleFacturaCompra"("productoId");

-- CreateIndex
CREATE INDEX "DetalleFacturaCompra_empresaId_idx" ON "DetalleFacturaCompra"("empresaId");

-- CreateIndex
CREATE INDEX "AbonoFactura_facturaId_idx" ON "AbonoFactura"("facturaId");

-- CreateIndex
CREATE INDEX "AbonoFactura_cajaId_idx" ON "AbonoFactura"("cajaId");

-- CreateIndex
CREATE INDEX "AbonoFactura_empresaId_idx" ON "AbonoFactura"("empresaId");

-- CreateIndex
CREATE INDEX "AdjuntoFactura_facturaId_idx" ON "AdjuntoFactura"("facturaId");

-- CreateIndex
CREATE INDEX "AdjuntoFactura_empresaId_idx" ON "AdjuntoFactura"("empresaId");

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaCompra" ADD CONSTRAINT "FacturaCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaCompra" ADD CONSTRAINT "FacturaCompra_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaCompra" ADD CONSTRAINT "FacturaCompra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaCompra" ADD CONSTRAINT "FacturaCompra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaCompra" ADD CONSTRAINT "FacturaCompra_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleFacturaCompra" ADD CONSTRAINT "DetalleFacturaCompra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleFacturaCompra" ADD CONSTRAINT "DetalleFacturaCompra_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleFacturaCompra" ADD CONSTRAINT "DetalleFacturaCompra_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "FacturaCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleFacturaCompra" ADD CONSTRAINT "DetalleFacturaCompra_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoFactura" ADD CONSTRAINT "AbonoFactura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoFactura" ADD CONSTRAINT "AbonoFactura_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoFactura" ADD CONSTRAINT "AbonoFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "FacturaCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoFactura" ADD CONSTRAINT "AbonoFactura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoFactura" ADD CONSTRAINT "AbonoFactura_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoFactura" ADD CONSTRAINT "AbonoFactura_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoFactura" ADD CONSTRAINT "AdjuntoFactura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoFactura" ADD CONSTRAINT "AdjuntoFactura_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoFactura" ADD CONSTRAINT "AdjuntoFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "FacturaCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoFactura" ADD CONSTRAINT "AdjuntoFactura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
