// Margen y precio sugerido. El margen se calcula SOBRE EL COSTO:
// costo $ 10.000 con 30 % → precio $ 13.000.

/**
 * Precio sugerido a partir del costo y el margen, redondeado hacia arriba:
 * a los $ 50 si es menor de $ 1.000 (la moneda más pequeña que circula) y a los $ 100 desde ahí.
 */
export function precioSugerido(costo: number, margenPorcentaje: number) {
  if (!(costo > 0)) return 0;
  const bruto = costo * (1 + margenPorcentaje / 100);
  const paso = bruto < 1000 ? 50 : 100;
  // Se resta una milésima para que errores de redondeo (13000.0000001) no suban un paso.
  return Math.ceil((bruto - 0.001) / paso) * paso;
}

/** Ganancia en pesos y porcentaje sobre el costo. null si no hay costo. */
export function calcularMargen(costo: number, precio: number) {
  if (!(costo > 0)) return null;
  const ganancia = precio - costo;
  return { ganancia, porcentaje: (ganancia / costo) * 100 };
}

/** El margen de la categoría manda sobre el del negocio. */
export function margenEfectivo(margenNegocio: number, margenCategoria: number | null | undefined) {
  return margenCategoria ?? margenNegocio;
}
