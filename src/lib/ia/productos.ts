// Lo que la IA devuelve al mirar fotos de productos (para cargar el inventario).
// Es independiente del proveedor de IA: cualquier lector debe devolver esto.
import { z } from "zod";

export const esquemaProductosLeidos = z.object({
  productos: z.array(
    z.object({
      /** Número de la foto de donde salió (1 = la primera). */
      foto: z.number(),
      /** Nombre corto como se vende: marca, sabor y tamaño ("Galletas Festival fresa x6"). */
      nombre: z.string(),
      marca: z.string().nullable(),
      /** Solo si se ve un código EAN/UPC de 8 a 14 dígitos. */
      codigoBarras: z.string().nullable(),
      /** Precio de venta si se ve en la foto (etiqueta, menú, tablero), en pesos. */
      precio: z.number().nullable(),
      /** Unidades que se alcanzan a contar con seguridad; null si no. */
      cantidad: z.number().nullable(),
      /** Categoría sugerida; si sirve una de las que ya tiene el negocio, esa misma. */
      categoria: z.string().nullable(),
      /** true si la foto muestra sobre todo este producto (sirve como foto del botón). */
      soloEsteProducto: z.boolean(),
    }),
  ),
  /** Algo que la persona deba saber ("la foto 3 está borrosa"). */
  nota: z.string().nullable(),
});

export type ProductosLeidos = z.infer<typeof esquemaProductosLeidos>;
export type ProductoVisto = ProductosLeidos["productos"][number];
