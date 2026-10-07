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

export const NOMBRE_MEDIO = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia" } as const;

export type VentaParaRecibo = {
  consecutivo: number;
  creadoEn: Date;
  total: number;
  descuento: number;
  cambio: number | null;
  estado: string;
  detalles: { nombre: string; cantidad: string; unidad: string; total: number }[];
  pagos: { medio: keyof typeof NOMBRE_MEDIO; valor: number }[];
};

/** Recibo en texto plano para mandar por WhatsApp. */
export function textoWhatsApp(venta: VentaParaRecibo, nombreNegocio: string, mensaje?: string | null) {
  const lineas = [
    `*${nombreNegocio}*`,
    `Recibo Nº ${formatearConsecutivo(venta.consecutivo)} · ${formatearFecha(venta.creadoEn)} ${formatearHora(venta.creadoEn)}`,
    venta.estado === "ANULADA" ? "*VENTA ANULADA*" : null,
    "",
    ...venta.detalles.map((d) => {
      const unidad = UNIDADES[d.unidad as UnidadMedida]?.corto ?? "";
      return `${formatearCantidad(d.cantidad)} ${unidad} ${d.nombre}: ${formatearPesos(d.total)}`;
    }),
    "",
    venta.descuento ? `Descuento: -${formatearPesos(venta.descuento)}` : null,
    `*Total: ${formatearPesos(venta.total)}*`,
    ...venta.pagos.map((p) => `${NOMBRE_MEDIO[p.medio]}: ${formatearPesos(p.valor)}`),
    venta.cambio ? `Cambio: ${formatearPesos(venta.cambio)}` : null,
    mensaje ? `\n${mensaje}` : null,
  ];
  return lineas.filter((l) => l !== null).join("\n");
}

/** Enlace que abre WhatsApp con el recibo escrito; la persona decide si lo envía. */
export function enlaceWhatsApp(texto: string, telefono: string | null | undefined) {
  const numero = telefonoWhatsApp(telefono);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;
}
