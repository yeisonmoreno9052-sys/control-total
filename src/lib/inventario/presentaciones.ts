// Presentaciones: otras formas de vender el mismo producto con precio propio.
//
// Ejemplo de la ferretería: el tubo se lleva en metros y se vende el metro a $4.500,
// pero el "Tubo completo" (6 m) se deja en $20.000. Lo mismo con la caja de tornillos
// (100 unidades), el rollo de malla o el rollo de alambre.
//
// El stock siempre está en la unidad del producto: vender 2 tubos completos descuenta 12 m.
import { z } from "zod";
import { Decimal, leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "./cantidades";

export type Presentacion = {
  /** Fijo aunque se cambie el nombre o el precio: así un carrito guardado la sigue encontrando. */
  id: string;
  nombre: string;
  /** Cuánto trae, en la unidad del producto ("6" metros). */
  cantidad: string;
  /** Precio del paquete completo, IVA incluido, en pesos. */
  precio: number;
};

export const MAXIMO_PRESENTACIONES = 5;

const fila = z.object({
  id: z.string().trim().max(40).optional().nullable(),
  nombre: z.string().trim().min(1, "Escribe el nombre del paquete, por ejemplo Tubo completo.").max(40, "Máximo 40 caracteres."),
  cantidad: z.union([z.string(), z.number()]),
  precio: z.union([z.string(), z.number()]),
});

export type PresentacionEntrada = z.input<typeof fila>;

/** Revisa las presentaciones que llegan del formulario. El primer error se muestra junto al campo. */
export const esquemaPresentaciones = z.array(fila).max(MAXIMO_PRESENTACIONES, `Máximo ${MAXIMO_PRESENTACIONES} paquetes por producto.`);

/**
 * Limpia y valida la lista contra la unidad del producto. Devuelve la lista lista para guardar
 * o el mensaje del primer problema.
 */
export function prepararPresentaciones(
  filas: z.infer<typeof esquemaPresentaciones>,
  opciones: { fraccionado: boolean; leerPesos: (v: string | number) => number | null },
): { ok: true; presentaciones: Presentacion[] } | { ok: false; error: string } {
  const vistos = new Set<string>();
  const presentaciones: Presentacion[] = [];
  for (const f of filas) {
    const nombre = f.nombre.replace(/\s+/g, " ");
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) return { ok: false, error: `Hay dos paquetes llamados "${nombre}".` };
    vistos.add(clave);
    const cantidad = leerCantidad(f.cantidad);
    const problema = validarCantidad(cantidad, { fraccionado: opciones.fraccionado });
    if (problema || !cantidad) return { ok: false, error: `${nombre}: ${MENSAJES_CANTIDAD[problema ?? "invalida"]}` };
    if (cantidad.lte(0)) return { ok: false, error: `${nombre}: escribe cuánto trae, por ejemplo 6.` };
    if (cantidad.greaterThan(1_000_000)) return { ok: false, error: `${nombre}: la cantidad es demasiado grande.` };
    const precio = opciones.leerPesos(f.precio);
    if (precio === null || precio <= 0) return { ok: false, error: `${nombre}: escribe el precio del paquete, por ejemplo 20.000.` };
    presentaciones.push({ id: f.id || nuevoId(), nombre, cantidad: cantidad.toString(), precio });
  }
  return { ok: true, presentaciones };
}

function nuevoId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Lee lo guardado en la base (JSON). Lo que no tenga forma de presentación se ignora. */
export function leerPresentaciones(valor: unknown): Presentacion[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((v): Presentacion[] => {
    if (!v || typeof v !== "object") return [];
    const { id, nombre, cantidad, precio } = v as Record<string, unknown>;
    if (typeof id !== "string" || typeof nombre !== "string" || typeof precio !== "number") return [];
    const c = leerCantidad(typeof cantidad === "number" ? cantidad : String(cantidad ?? ""));
    if (!c || c.lte(0)) return [];
    return [{ id, nombre, cantidad: c.toString(), precio }];
  });
}

/** Cuánto sale del stock por una línea: paquetes × lo que trae cada uno, o la cantidad tal cual. */
export function unidadesDe(cantidad: Decimal | string, presentacion?: Pick<Presentacion, "cantidad"> | null) {
  const c = new Decimal(cantidad.toString());
  return presentacion ? c.times(presentacion.cantidad) : c;
}
