// Validación de los datos de un producto. La usan el formulario y la importación,
// así las reglas son las mismas venga el producto de donde venga.
import { z } from "zod";
import { CondicionProducto, UnidadMedida } from "@/generated/prisma/enums";
import { leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "./cantidades";
import { IVAS } from "./unidades";

/** "$ 13.000" → 13000. Devuelve null si no es un valor en pesos válido. */
export function leerPesos(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? Math.round(texto) : null;
  let t = texto.trim().replace(/[$\s]/g, "");
  if (!t) return null;
  // "13.000,50" o "13000,5": los centavos se redondean (el dinero se maneja en pesos enteros).
  const coma = t.match(/^(.*),(\d{1,2})$/);
  if (coma) {
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(coma[1])) return null;
    t = `${coma[1].replace(/\./g, "")}.${coma[2]}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
  // En pesos el punto es separador de miles: "15.6" es ambiguo y se rechaza.
  else if (!/^\d+$/.test(t)) return null;
  return Math.round(Number(t));
}

const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => v || null)
    .nullable()
    .optional();

const pesos = (nombre: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const valor = leerPesos(v);
    if (valor === null || valor < 0) {
      ctx.addIssue({ code: "custom", message: `Escribe ${nombre} válido, por ejemplo 13.000.` });
      return z.NEVER;
    }
    return valor;
  });

const cantidad = z.union([z.string(), z.number()]).transform((v, ctx) => {
  if (v === "" || v === null) return "0";
  const valor = leerCantidad(v);
  if (!valor || valor.isNegative()) {
    ctx.addIssue({ code: "custom", message: MENSAJES_CANTIDAD.invalida });
    return z.NEVER;
  }
  return valor.toString();
});

const siNo = z.union([z.boolean(), z.string()]).transform((v) => {
  if (typeof v === "boolean") return v;
  return ["on", "true", "si", "sí", "1", "x"].includes(v.trim().toLowerCase());
});

export const esquemaProducto = z
  .object({
    codigo: texto(50).min(1, "Escribe el código del producto."),
    codigoBarras: opcional(60),
    nombre: texto(150).min(1, "Escribe el nombre del producto."),
    descripcion: opcional(500),
    categoriaId: opcional(40),
    costo: pesos("un costo"),
    precioVenta: pesos("un precio"),
    stockMinimo: cantidad,
    unidad: z.enum(UnidadMedida, { message: "Elige una unidad de medida." }),
    fraccionado: siNo,
    porcentajeIva: z.coerce
      .number()
      .refine((v) => (IVAS as readonly number[]).includes(v), "El IVA debe ser 0, 5 o 19 %."),
    condicion: z.enum(CondicionProducto, { message: "Elige si es nuevo o de segunda." }),
  })
  .superRefine((p, ctx) => {
    if (p.fraccionado && p.unidad === "UNIDAD") {
      ctx.addIssue({
        code: "custom",
        path: ["fraccionado"],
        message: "Un producto por unidad no se vende fraccionado. Cambia la unidad (metro, kilo…).",
      });
    }
    if (p.precioVenta <= 0) {
      ctx.addIssue({ code: "custom", path: ["precioVenta"], message: "El precio de venta debe ser mayor que cero." });
    }
    const minimo = leerCantidad(p.stockMinimo);
    const error = validarCantidad(minimo, { fraccionado: p.fraccionado });
    if (error) ctx.addIssue({ code: "custom", path: ["stockMinimo"], message: MENSAJES_CANTIDAD[error] });
  });

export type ProductoEntrada = z.infer<typeof esquemaProducto>;

/** Convierte los errores de Zod en { campo: mensaje } para mostrarlos junto a cada campo. */
export function erroresPorCampo(error: z.ZodError) {
  const campos: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "general");
    campos[campo] ??= issue.message;
  }
  return campos;
}

/** "Compré una pieza de segunda": crea el producto y registra la compra en un solo paso. */
export const esquemaPiezaSegunda = z
  .object({
    nombre: texto(150).min(1, "Escribe qué pieza es."),
    descripcion: opcional(500),
    categoriaId: opcional(40),
    /** Vacío = "Particulares" (se crea solo la primera vez). */
    proveedorId: opcional(40),
    cantidad: z.coerce
      .number({ message: "Escribe cuántas piezas." })
      .int("Escribe un número entero.")
      .min(1, "Debe ser al menos 1.")
      .max(9999, "Máximo 9.999."),
    costo: pesos("lo que pagaste"),
    precioVenta: pesos("un precio"),
    porcentajeIva: z.coerce
      .number()
      .refine((v) => (IVAS as readonly number[]).includes(v), "El IVA debe ser 0, 5 o 19 %."),
    medio: z.enum(["EFECTIVO", "TRANSFERENCIA"], { message: "Elige cómo pagaste." }),
    desdeCaja: siNo,
  })
  .superRefine((p, ctx) => {
    if (p.precioVenta <= 0) {
      ctx.addIssue({ code: "custom", path: ["precioVenta"], message: "El precio de venta debe ser mayor que cero." });
    }
  });

export type PiezaSegundaEntrada = z.infer<typeof esquemaPiezaSegunda>;
