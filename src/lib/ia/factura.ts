// Lo que la IA devuelve al leer la foto de una factura de compra.
// Es independiente del proveedor de IA: cualquier lector debe devolver esto.
import { z } from "zod";

export const esquemaFacturaLeida = z.object({
  /** false si la foto no es una factura o no se alcanza a leer. */
  legible: z.boolean(),
  proveedor: z.object({
    nombre: z.string(),
    nit: z.string().nullable(),
    telefono: z.string().nullable(),
  }),
  numero: z.string().nullable(),
  /** AAAA-MM-DD */
  fecha: z.string().nullable(),
  /** AAAA-MM-DD */
  vencimiento: z.string().nullable(),
  formaPago: z.enum(["contado", "credito", "desconocida"]),
  /** Total a pagar impreso en la factura, en pesos. */
  total: z.number().nullable(),
  lineas: z.array(
    z.object({
      codigo: z.string().nullable(),
      codigoBarras: z.string().nullable(),
      descripcion: z.string(),
      cantidad: z.number(),
      unidad: z.string().nullable(),
      /** Valor de una unidad tal como aparece en la factura. */
      valorUnitario: z.number(),
      /** true si valorUnitario ya trae el IVA incluido. */
      incluyeIva: z.boolean(),
      porcentajeIva: z.number().nullable(),
      descuentoPorcentaje: z.number().nullable(),
      totalLinea: z.number().nullable(),
    }),
  ),
  /** Algo que la persona deba saber ("la segunda hoja está borrosa"). */
  nota: z.string().nullable(),
});

export type FacturaLeida = z.infer<typeof esquemaFacturaLeida>;
export type LineaLeida = FacturaLeida["lineas"][number];
