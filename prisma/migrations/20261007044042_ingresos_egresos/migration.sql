-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "CategoriaMovimientoCaja" AS ENUM ('NOMINA', 'ARRIENDO', 'SERVICIOS', 'TRANSPORTE', 'INSUMOS', 'IMPUESTOS', 'RETIRO_DUENO', 'OTRO_EGRESO', 'APORTE', 'OTRO_INGRESO');

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "categoria" "CategoriaMovimientoCaja" NOT NULL,
    "fecha" DATE NOT NULL,
    "valor" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "pagadoA" TEXT,
    "nota" TEXT,
    "cajaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "motivoAnulacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoCaja_negocioId_fecha_idx" ON "MovimientoCaja"("negocioId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoCaja_cajaId_idx" ON "MovimientoCaja"("cajaId");

-- CreateIndex
CREATE INDEX "MovimientoCaja_empresaId_idx" ON "MovimientoCaja"("empresaId");

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

