-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('REGISTRADA', 'ANULADA', 'CON_DEVOLUCION');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'NIT', 'CE', 'PASAPORTE', 'TI', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logoTipo" TEXT;

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "consecutivoDevolucion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consecutivoVenta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mensajeRecibo" TEXT,
ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento",
    "numeroDocumento" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "correo" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'ABIERTA',
    "base" INTEGER NOT NULL,
    "abiertaPorId" TEXT NOT NULL,
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaPorId" TEXT,
    "cerradaEn" TIMESTAMP(3),
    "esperado" INTEGER,
    "contado" INTEGER,
    "diferencia" INTEGER,
    "nota" TEXT,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "consecutivo" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "descuento" INTEGER NOT NULL,
    "base" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "recibido" INTEGER,
    "cambio" INTEGER,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'REGISTRADA',
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "anuladaEnCajaId" TEXT,
    "motivoAnulacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feEstado" TEXT,
    "feIdentificador" TEXT,
    "feRespuesta" JSONB,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleVenta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "cantidadDevuelta" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "precioUnitario" INTEGER NOT NULL,
    "costoUnitario" INTEGER NOT NULL,
    "porcentajeIva" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "descuento" INTEGER NOT NULL,
    "base" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "DetalleVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoVenta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "valor" INTEGER NOT NULL,
    "referencia" TEXT,

    CONSTRAINT "PagoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devolucion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "base" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Devolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleDevolucion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "devolucionId" TEXT NOT NULL,
    "detalleVentaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "base" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "DetalleDevolucion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_empresaId_idx" ON "Cliente"("empresaId");

-- CreateIndex
CREATE INDEX "Cliente_negocioId_nombre_idx" ON "Cliente"("negocioId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_negocioId_tipoDocumento_numeroDocumento_key" ON "Cliente"("negocioId", "tipoDocumento", "numeroDocumento");

-- CreateIndex
CREATE INDEX "Caja_empresaId_idx" ON "Caja"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Caja_negocioId_fecha_key" ON "Caja"("negocioId", "fecha");

-- CreateIndex
CREATE INDEX "Venta_empresaId_idx" ON "Venta"("empresaId");

-- CreateIndex
CREATE INDEX "Venta_negocioId_creadoEn_idx" ON "Venta"("negocioId", "creadoEn");

-- CreateIndex
CREATE INDEX "Venta_cajaId_idx" ON "Venta"("cajaId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_negocioId_consecutivo_key" ON "Venta"("negocioId", "consecutivo");

-- CreateIndex
CREATE INDEX "DetalleVenta_ventaId_idx" ON "DetalleVenta"("ventaId");

-- CreateIndex
CREATE INDEX "DetalleVenta_productoId_idx" ON "DetalleVenta"("productoId");

-- CreateIndex
CREATE INDEX "DetalleVenta_empresaId_idx" ON "DetalleVenta"("empresaId");

-- CreateIndex
CREATE INDEX "PagoVenta_ventaId_idx" ON "PagoVenta"("ventaId");

-- CreateIndex
CREATE INDEX "PagoVenta_empresaId_idx" ON "PagoVenta"("empresaId");

-- CreateIndex
CREATE INDEX "Devolucion_ventaId_idx" ON "Devolucion"("ventaId");

-- CreateIndex
CREATE INDEX "Devolucion_cajaId_idx" ON "Devolucion"("cajaId");

-- CreateIndex
CREATE INDEX "Devolucion_empresaId_idx" ON "Devolucion"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Devolucion_negocioId_consecutivo_key" ON "Devolucion"("negocioId", "consecutivo");

-- CreateIndex
CREATE INDEX "DetalleDevolucion_devolucionId_idx" ON "DetalleDevolucion"("devolucionId");

-- CreateIndex
CREATE INDEX "DetalleDevolucion_empresaId_idx" ON "DetalleDevolucion"("empresaId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_anuladaEnCajaId_fkey" FOREIGN KEY ("anuladaEnCajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucion" ADD CONSTRAINT "Devolucion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleDevolucion" ADD CONSTRAINT "DetalleDevolucion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleDevolucion" ADD CONSTRAINT "DetalleDevolucion_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleDevolucion" ADD CONSTRAINT "DetalleDevolucion_devolucionId_fkey" FOREIGN KEY ("devolucionId") REFERENCES "Devolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleDevolucion" ADD CONSTRAINT "DetalleDevolucion_detalleVentaId_fkey" FOREIGN KEY ("detalleVentaId") REFERENCES "DetalleVenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleDevolucion" ADD CONSTRAINT "DetalleDevolucion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
