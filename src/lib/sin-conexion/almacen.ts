// Almacenamiento del navegador (IndexedDB) para vender sin internet: la copia de los
// productos, las ventas pendientes por subir y algunos datos sueltos (número provisional,
// datos del negocio para el recibo). Solo corre en el navegador.
import type { ProductoCatalogo } from "@/lib/datos/productos";
import type { VentaSinConexion } from "@/lib/datos/ventas-sin-conexion";

const NOMBRE = "control-total";
const VERSION = 1;

export type VentaPendiente = VentaSinConexion & {
  negocioId: string;
  /** Lo necesario para volver a imprimir el recibo sin internet. */
  recibo: ReciboLocal;
  /** Último error al subirla (null si no ha fallado). */
  error: string | null;
  /** false: el error no se arregla reintentando; la venta espera revisión. */
  reintentar: boolean;
};

export type ReciboLocal = {
  vendedor: string;
  cliente: string | null;
  lineas: {
    nombre: string;
    unidad: string;
    cantidad: string;
    precioUnitario: number;
    porcentajeIva: number;
    subtotal: number;
    descuento: number;
    base: number;
    iva: number;
  }[];
  subtotal: number;
  descuento: number;
  total: number;
  pagos: { medio: "EFECTIVO" | "TRANSFERENCIA"; valor: number; referencia: string | null }[];
  recibido: number | null;
  cambio: number | null;
};

export type DatosRecibo = {
  nombre: string;
  razonSocial: string | null;
  nit: string | null;
  regimen: string | null;
  direccion: string | null;
  telefono: string | null;
  mensajeRecibo: string | null;
  /** Logo como data URL, para imprimirlo sin internet. */
  logo: string | null;
};

type FilaProducto = ProductoCatalogo & { negocioId: string };

let abierta: Promise<IDBDatabase> | null = null;

function abrir() {
  abierta ??= new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(NOMBRE, VERSION);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      const productos = db.createObjectStore("productos", { keyPath: ["negocioId", "id"] });
      productos.createIndex("negocio", "negocioId");
      const ventas = db.createObjectStore("ventas", { keyPath: "idLocal" });
      ventas.createIndex("negocio", "negocioId");
      db.createObjectStore("meta");
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => {
      abierta = null;
      rechazar(pedido.error);
    };
  });
  return abierta;
}

function esperar<T>(pedido: IDBRequest<T>) {
  return new Promise<T>((resolver, rechazar) => {
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

function terminar(tx: IDBTransaction) {
  return new Promise<void>((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

// ─── Productos ──────────────────────────────────────────────────────────────

export async function leerProductos(negocioId: string): Promise<ProductoCatalogo[]> {
  const db = await abrir();
  const filas = await esperar(db.transaction("productos").objectStore("productos").index("negocio").getAll(negocioId));
  return filas as FilaProducto[];
}

/** Guarda lo que llegó del servidor. `completo`: es la lista entera, se borra lo que no venga. */
export async function guardarProductos(negocioId: string, productos: ProductoCatalogo[], completo: boolean) {
  const db = await abrir();
  const tx = db.transaction("productos", "readwrite");
  const almacen = tx.objectStore("productos");
  if (completo) almacen.delete(IDBKeyRange.bound([negocioId, ""], [negocioId, "￿"]));
  for (const p of productos) {
    if (p.activo) almacen.put({ ...p, negocioId } satisfies FilaProducto);
    else almacen.delete([negocioId, p.id]);
  }
  await terminar(tx);
}

/** Después de una venta sin internet, baja el stock de la copia (para que la caja muestre lo que queda). */
export async function descontarStock(
  negocioId: string,
  cantidades: Map<string, string>,
  restar: (stock: string, cantidad: string) => string,
) {
  const db = await abrir();
  const tx = db.transaction("productos", "readwrite");
  const almacen = tx.objectStore("productos");
  for (const [id, cantidad] of cantidades) {
    const fila = (await esperar(almacen.get([negocioId, id]))) as FilaProducto | undefined;
    if (fila) almacen.put({ ...fila, stock: restar(fila.stock, cantidad) });
  }
  await terminar(tx);
}

// ─── Ventas pendientes ──────────────────────────────────────────────────────

export async function guardarVenta(venta: VentaPendiente) {
  const db = await abrir();
  const tx = db.transaction("ventas", "readwrite");
  tx.objectStore("ventas").put(venta);
  await terminar(tx);
}

export async function listarVentas(negocioId?: string): Promise<VentaPendiente[]> {
  const db = await abrir();
  const almacen = db.transaction("ventas").objectStore("ventas");
  const filas = (await esperar(negocioId ? almacen.index("negocio").getAll(negocioId) : almacen.getAll())) as VentaPendiente[];
  return filas.sort((a, b) => a.creadaEn.localeCompare(b.creadaEn));
}

export async function borrarVenta(idLocal: string) {
  const db = await abrir();
  const tx = db.transaction("ventas", "readwrite");
  tx.objectStore("ventas").delete(idLocal);
  await terminar(tx);
}

// ─── Datos sueltos ──────────────────────────────────────────────────────────

export async function leerMeta<T>(clave: string): Promise<T | undefined> {
  const db = await abrir();
  return (await esperar(db.transaction("meta").objectStore("meta").get(clave))) as T | undefined;
}

export async function guardarMeta(clave: string, valor: unknown) {
  const db = await abrir();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(valor, clave);
  await terminar(tx);
}

/** Siguiente número provisional de este computador para el negocio: P-0001, P-0002… */
export async function siguienteProvisional(negocioId: string) {
  const db = await abrir();
  const tx = db.transaction("meta", "readwrite");
  const almacen = tx.objectStore("meta");
  const clave = `provisional:${negocioId}`;
  const actual = ((await esperar(almacen.get(clave))) as number | undefined) ?? 0;
  almacen.put(actual + 1, clave);
  await terminar(tx);
  return `P-${String(actual + 1).padStart(4, "0")}`;
}
