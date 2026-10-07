-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMINISTRADOR', 'SOCIO', 'CAJERO', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('ACTIVA', 'SUSPENDIDA');

-- CreateEnum
CREATE TYPE "Modulo" AS ENUM ('INVENTARIO', 'VENTAS', 'PROVEEDORES', 'CAJA', 'REPORTES');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "telefono" TEXT,
    "correo" TEXT,
    "direccion" TEXT,
    "logoUrl" TEXT,
    "estadoSuscripcion" "EstadoSuscripcion" NOT NULL DEFAULT 'ACTIVA',
    "modulosActivos" "Modulo"[] DEFAULT ARRAY['INVENTARIO', 'VENTAS', 'PROVEEDORES', 'CAJA', 'REPORTES']::"Modulo"[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "tipo" TEXT,
    "nit" TEXT,
    "razonSocial" TEXT,
    "regimen" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "usuario" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hashContrasena" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioNegocio" (
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,

    CONSTRAINT "UsuarioNegocio_pkey" PRIMARY KEY ("usuarioId","negocioId")
);

-- CreateIndex
CREATE INDEX "Negocio_empresaId_idx" ON "Negocio"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");

-- CreateIndex
CREATE INDEX "UsuarioNegocio_empresaId_idx" ON "UsuarioNegocio"("empresaId");

-- CreateIndex
CREATE INDEX "UsuarioNegocio_negocioId_idx" ON "UsuarioNegocio"("negocioId");

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioNegocio" ADD CONSTRAINT "UsuarioNegocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioNegocio" ADD CONSTRAINT "UsuarioNegocio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioNegocio" ADD CONSTRAINT "UsuarioNegocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
