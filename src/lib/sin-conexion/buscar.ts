// Búsqueda de productos en la copia del navegador, con las mismas reglas que la del
// servidor (buscarParaVenta): un código exacto entra directo; si no, código que empieza
// así o nombre que contiene todas las palabras.
import type { ProductoCatalogo, ProductoCaja } from "@/lib/datos/productos";

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
  };
}

export function buscarEnCopia(productos: ProductoCatalogo[], texto: string) {
  const q = texto.trim().slice(0, 100);
  if (!q) return { exacto: null, resultados: [] as ProductoCaja[] };
  const minuscula = q.toLowerCase();

  const exacto = productos.find((p) => p.codigoBarras === q || p.codigo.toLowerCase() === minuscula);
  if (exacto) return { exacto: aCaja(exacto), resultados: [aCaja(exacto)] };

  const palabras = minuscula.split(/\s+/).filter(Boolean).slice(0, 6);
  const resultados: ProductoCatalogo[] = [];
  for (const p of productos) {
    const nombre = p.nombre.toLowerCase();
    if (p.codigo.toLowerCase().startsWith(minuscula) || palabras.every((w) => nombre.includes(w))) resultados.push(p);
  }
  resultados.sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || (a.id < b.id ? -1 : 1));
  return { exacto: null, resultados: resultados.slice(0, 8).map(aCaja) };
}
