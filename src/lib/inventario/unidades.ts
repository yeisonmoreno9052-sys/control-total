import type { CondicionProducto, MotivoAjuste, TipoMovimiento, UnidadMedida } from "@/generated/prisma/enums";

export const UNIDADES: Record<UnidadMedida, { nombre: string; corto: string }> = {
  UNIDAD: { nombre: "Unidad", corto: "und" },
  METRO: { nombre: "Metro", corto: "m" },
  CENTIMETRO: { nombre: "Centímetro", corto: "cm" },
  KILO: { nombre: "Kilo", corto: "kg" },
  GRAMO: { nombre: "Gramo", corto: "g" },
  LIBRA: { nombre: "Libra", corto: "lb" },
  LITRO: { nombre: "Litro", corto: "L" },
  GALON: { nombre: "Galón", corto: "gal" },
};

export const CONDICIONES: Record<CondicionProducto, string> = {
  NUEVO: "Nuevo",
  DE_SEGUNDA: "De segunda",
};

export const MOTIVOS_AJUSTE: Record<MotivoAjuste, string> = {
  CONTEO: "Conteo físico",
  DANO: "Daño",
  PERDIDA: "Pérdida",
  OTRO: "Otro",
};

export const TIPOS_MOVIMIENTO: Record<TipoMovimiento, string> = {
  CREACION: "Stock inicial",
  AJUSTE: "Ajuste",
  IMPORTACION: "Importación",
  COMPRA: "Compra",
  VENTA: "Venta",
  ANULACION: "Anulación",
  DEVOLUCION: "Devolución",
};

export const IVAS = [0, 5, 19] as const;
