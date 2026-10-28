// Paletas de colores que puede tener cada empresa. Los colores de verdad viven en
// src/styles/tema.css; aquí solo está la lista para escoger y una muestra para el panel.

export const PALETAS = [
  { valor: "indigo", nombre: "Índigo noche", descripcion: "La de Control Total", muestra: ["#111633", "#4f46e5", "#f4f5fb"] },
  { valor: "cafe", nombre: "Café y crema", descripcion: "Cálida, para cafeterías", muestra: ["#2a1a12", "#9a5b22", "#faf5ee"] },
] as const;

export type Paleta = (typeof PALETAS)[number]["valor"];

export const PALETA_POR_DEFECTO: Paleta = "indigo";

export function esPaleta(valor: unknown): valor is Paleta {
  return PALETAS.some((p) => p.valor === valor);
}
