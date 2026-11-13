// Búsqueda de productos en la copia del navegador, con las mismas reglas que la del
// servidor (buscarParaVenta): un código exacto entra directo; si no, código que empieza
// así o nombre que contiene todas las palabras.
import type { ProductoCatalogo, ProductoCaja } from "@/lib/datos/productos";
import { ordenarConPrendas } from "@/lib/inventario/prendas";
import { paraBuscar } from "@/lib/texto";

export function aCaja(p: ProductoCatalogo): ProductoCaja {
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    precioVenta: p.precioVenta,
    porcentajeIva: p.porcentajeIva,
    unidad: p.unidad,
    fraccionado: p.fraccionado,
    stock: p.stock,
    prendaId: p.prendaId ?? null,
    prenda: p.prenda ?? null,
    talla: p.talla ?? null,
    color: p.color ?? null,
  };
}

export function buscarEnCopia(productos: ProductoCatalogo[], texto: string) {
  const q = texto.trim().slice(0, 100);
  if (!q) return { exacto: null, resultados: [] as ProductoCaja[] };
  const minuscula = q.toLowerCase();

  const exacto = productos.find((p) => p.codigoBarras === q || p.codigo.toLowerCase() === minuscula);
  if (exacto) return { exacto: aCaja(exacto), resultados: [aCaja(exacto)] };

  const palabras = paraBuscar(minuscula).split(/\s+/).filter(Boolean).slice(0, 6);
  const resultados: ProductoCatalogo[] = [];
  for (const p of productos) {
    const nombre = paraBuscar(p.nombre);
    if (p.codigo.toLowerCase().startsWith(minuscula) || palabras.every((w) => nombre.includes(w))) resultados.push(p);
  }
  resultados.sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || (a.id < b.id ? -1 : 1));
  const primeros = resultados.slice(0, 8);
  // Igual que en el servidor: una prenda trae todas sus tallas y colores.
  const prendas = new Set(primeros.map((p) => p.prendaId).filter(Boolean));
  if (!prendas.size) return { exacto: null, resultados: primeros.map(aCaja) };
  const variantes = productos.filter((p) => p.prendaId && prendas.has(p.prendaId)).slice(0, 400);
  const lista = ordenarConPrendas([...primeros.filter((p) => !p.prendaId), ...variantes]);
  return { exacto: null, resultados: lista.map(aCaja) };
}
