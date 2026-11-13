// Textos del recibo: número de venta, mensaje para WhatsApp y teléfono del cliente.
import { formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { formatearCantidad } from "@/lib/inventario/cantidades";
import { UNIDADES } from "@/lib/inventario/unidades";
import type { UnidadMedida } from "@/generated/prisma/enums";

/** 128 → "000128" */
export function formatearConsecutivo(n: number) {
  return String(n).padStart(6, "0");
}

/**
 * Teléfono para wa.me: solo dígitos y con indicativo de Colombia.
 * "300 123 4567" → "573001234567". Devuelve null si no parece un celular.
 */
export function telefonoWhatsApp(telefono: string | null | undefined) {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`;
  if (/^573\d{9}$/.test(digitos)) return digitos;
  return null;
}

/** Cantidad de una línea vendida por paquete (presentacion) o por la unidad del producto. */
export type CantidadLinea = {
  cantidad: string;
  unidad: string;
  /** Nombre del paquete ("Tubo completo"), si se vendió así. */
  presentacion?: string | null;
  /** Cuánto trae cada paquete, en la unidad del producto. */
  porPresentacion?: string | null;
  /** Cuántos paquetes. */
  paquetes?: string | null;
};

/** "3 m" · "2 Tubo completo (6 m)" */
export function textoCantidad(d: CantidadLinea) {
  const unidad = UNIDADES[d.unidad as UnidadMedida]?.corto ?? "";
  if (d.presentacion && d.paquetes && d.porPresentacion) {
    return `${formatearCantidad(d.paquetes)} ${d.presentacion} (${formatearCantidad(d.porPresentacion)} ${unidad})`;
  }
  return `${formatearCantidad(d.cantidad)} ${unidad}`;
}

export const NOMBRE_MEDIO = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  CREDITO: "Crédito (fiado)",
  TARJETA: "Datáfono",
  SISTECREDITO: "Sistecrédito",
} as const;

export type VentaParaRecibo = {
  consecutivo: number;
  creadoEn: Date;
  total: number;
  descuento: number;
  cambio: number | null;
  estado: string;
  detalles: (CantidadLinea & { nombre: string; total: number })[];
  pagos: { medio: keyof typeof NOMBRE_MEDIO; valor: number }[];
};

/** Recibo en texto plano para mandar por WhatsApp. */
export function textoWhatsApp(
  venta: VentaParaRecibo,
  nombreNegocio: string,
  mensaje?: string | null,
  /** Lo que debe el cliente hoy, si la venta fue fiada. */
  saldoPendiente?: number | null,
) {
  const lineas = [
    `*${nombreNegocio}*`,
    `Recibo Nº ${formatearConsecutivo(venta.consecutivo)} · ${formatearFecha(venta.creadoEn)} ${formatearHora(venta.creadoEn)}`,
    venta.estado === "ANULADA" ? "*VENTA ANULADA*" : null,
    "",
    ...venta.detalles.map((d) => `${textoCantidad(d)} ${d.nombre}: ${formatearPesos(d.total)}`),
    "",
    venta.descuento ? `Descuento: -${formatearPesos(venta.descuento)}` : null,
    `*Total: ${formatearPesos(venta.total)}*`,
    ...venta.pagos.map((p) => `${NOMBRE_MEDIO[p.medio]}: ${formatearPesos(p.valor)}`),
    venta.cambio ? `Cambio: ${formatearPesos(venta.cambio)}` : null,
    saldoPendiente && saldoPendiente > 0 ? `*Saldo pendiente: ${formatearPesos(saldoPendiente)}*` : null,
    mensaje ? `\n${mensaje}` : null,
  ];
  return lineas.filter((l) => l !== null).join("\n");
}

/** Enlace que abre WhatsApp con el recibo escrito; la persona decide si lo envía. */
export function enlaceWhatsApp(texto: string, telefono: string | null | undefined) {
  const numero = telefonoWhatsApp(telefono);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;
}
