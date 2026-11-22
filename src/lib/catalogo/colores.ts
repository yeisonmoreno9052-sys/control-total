// Color de muestra (el circulito) para los nombres de color que escriben las tiendas.
import { normalizar } from "@/lib/inventario/prendas";

const COLORES: Record<string, string> = {
  blanco: "#ffffff", negro: "#111111", gris: "#8a8f98", "gris claro": "#c9ccd1", "gris oscuro": "#4a4e55",
  rojo: "#d32f2f", "vino tinto": "#6d1a2a", vinotinto: "#6d1a2a", vino: "#6d1a2a", rosado: "#f4a6c0", rosa: "#f4a6c0",
  "palo de rosa": "#d8a7a0", fucsia: "#d6247a", lila: "#c3a6e0", morado: "#6b3fa0", violeta: "#7e57c2",
  azul: "#1e5bc6", "azul claro": "#9fc3ea", "azul rey": "#1f3fbf", "azul oscuro": "#1b2a4a", "azul marino": "#1b2a4a",
  jean: "#3b5b8c", celeste: "#8fd0f0", turquesa: "#1fb5b0", verde: "#2e8b57", "verde militar": "#4b5320",
  "verde menta": "#a8e6cf", "verde oliva": "#708238", amarillo: "#f5d33f", mostaza: "#d4a017", naranja: "#f08a24",
  coral: "#ff7f6b", cafe: "#6f4e37", marron: "#6f4e37", beige: "#e8d8bd", crema: "#f5ecd7", "hueso": "#efe8dc",
  camel: "#c19a6b", dorado: "#c9a24a", plateado: "#c0c0c0", nude: "#e3bc9a", terracota: "#c2643c",
};

/** "Azul claro" → "#9fc3ea". null si no se reconoce (se muestra solo el nombre). */
export function colorMuestra(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const n = normalizar(nombre);
  return COLORES[n] ?? COLORES[n.split(" ")[0]] ?? null;
}
