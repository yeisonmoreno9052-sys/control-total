import type { CSSProperties } from "react";
import type { Paleta } from "@/lib/paletas";

/** Colores del catálogo según la paleta de la empresa. El catálogo siempre va en modo claro. */
const TEMAS: Record<Paleta, Record<string, string>> = {
  dorado: { noche: "#0e0e10", acento: "#b8892f", acentoClaro: "#f1d48f", suave: "#f5eedf", fondo: "#faf7f1", borde: "#e6dccb", tinta: "#1a1814", gris: "#7a7163" },
  indigo: { noche: "#111633", acento: "#4f46e5", acentoClaro: "#c7c4ff", suave: "#eceafd", fondo: "#f4f5fb", borde: "#dfe1ef", tinta: "#141729", gris: "#6b6f85" },
  cafe: { noche: "#2a1a12", acento: "#9a5b22", acentoClaro: "#f0c58f", suave: "#f6ebdd", fondo: "#faf5ee", borde: "#e8dccb", tinta: "#22160f", gris: "#7c6a5c" },
};

export function estiloTema(paleta: Paleta): CSSProperties {
  const t = TEMAS[paleta] ?? TEMAS.indigo;
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--ct-${k}`, v])) as CSSProperties;
}

export function colorNoche(paleta: Paleta) {
  return (TEMAS[paleta] ?? TEMAS.indigo).noche;
}
