// El emoji que acompaña el "Hola" del inicio, según de qué es el negocio.
// Se adivina por el tipo o el nombre del local; si no se reconoce, sale una chispa.

const EMOJIS: [RegExp, string][] = [
  [/caf[eé]|cafeter|tinto|panader|pasteler|reposter|restaurante|comida|cocina|club/, "☕"],
  [/ferreter|herramient|construcc|tornill/, "🔧"],
  [/moto|repuesto|taller|mec[aá]nic/, "🏍️"],
  [/droguer|farmac/, "💊"],
  [/ropa|boutique|moda|calzado/, "👗"],
  [/tienda|minimercado|mercado|supermercado|abarrote|granero/, "🛒"],
];

export const EMOJI_POR_DEFECTO = "✨";

export function emojiDeNegocio(negocio: { nombre: string; tipo?: string | null } | null | undefined) {
  if (!negocio) return EMOJI_POR_DEFECTO;
  // Primero el tipo (lo eligió quien creó el negocio); después el nombre.
  for (const texto of [negocio.tipo, negocio.nombre]) {
    const t = texto?.toLowerCase().trim();
    if (!t) continue;
    for (const [patron, emoji] of EMOJIS) if (patron.test(t)) return emoji;
  }
  return EMOJI_POR_DEFECTO;
}
