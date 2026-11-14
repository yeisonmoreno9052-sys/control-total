// El lector de código de barras "escribe" como un teclado de Estados Unidos. Si el
// computador tiene el teclado en español (Latinoamérica o España), el guion de los
// códigos (PR-0001-M, EJ-ACC01) llega como comilla: EJ'ACC01. Muchos lectores no dejan
// cambiar el idioma, así que aquí se corrige.

/** El código como lo quiso mandar el lector, o null si no hay nada que corregir. */
export function corregirLector(codigo: string): string | null {
  const corregido = codigo.replace(/['´]/g, "-");
  return corregido === codigo ? null : corregido;
}
