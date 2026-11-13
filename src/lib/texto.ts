/**
 * Texto para buscar: minúsculas y sin tildes ("Pantalón" → "pantalon").
 * Hace lo mismo que la función ct_sin_tildes de la base de datos, que llena Producto.nombreBusqueda.
 */
export function paraBuscar(texto: string) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
