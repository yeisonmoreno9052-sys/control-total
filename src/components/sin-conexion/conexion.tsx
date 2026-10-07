"use client";

// Estado de la conexión para toda la app: sabe si hay internet, guarda la copia de
// productos del negocio, guarda las ventas hechas sin internet y las sube solas cuando
// vuelve la conexión. La caja y el cierre de caja lo usan con useConexion().
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { subirVentaPendiente } from "@/app/(app)/ventas/acciones";
import type { ProductoCatalogo } from "@/lib/datos/productos";
import {
  borrarVenta,
  guardarMeta,
  guardarProductos,
  guardarVenta,
  leerMeta,
  leerProductos,
  listarVentas,
  type DatosRecibo,
  type VentaPendiente,
} from "@/lib/sin-conexion/almacen";

type Conexion = {
  enLinea: boolean;
  negocioId: string | null;
  usuario: { id: string; nombre: string };
  /** Ventas hechas sin internet que aún no suben (de todos los negocios de este computador). */
  pendientes: VentaPendiente[];
  subiendo: boolean;
  /** Mensaje corto después de subir ("Listo: 3 ventas subidas"). */
  aviso: string | null;
  /** La caja lo llama cuando una petición falla por falta de internet. */
  marcarSinConexion: () => void;
  productos: () => Promise<ProductoCatalogo[]>;
  datosRecibo: () => Promise<DatosRecibo | null>;
  guardarVentaLocal: (venta: VentaPendiente) => Promise<void>;
  subirPendientes: () => Promise<void>;
};

const ContextoConexion = createContext<Conexion | null>(null);

export function useConexion() {
  const c = useContext(ContextoConexion);
  if (!c) throw new Error("useConexion va dentro de <ProveedorConexion>");
  return c;
}

/** true si el error es de red (no llegó al servidor), no un error del servidor. */
export function esErrorDeRed(error: unknown) {
  return error instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}

const CADA_CUANTO_CATALOGO = 5 * 60 * 1000;
const CADA_CUANTO_PRUEBA = 8 * 1000;
const COPIA_COMPLETA_CADA = 24 * 60 * 60 * 1000;

type MetaCatalogo = { hasta: string; completoEn: string };
type RespuestaCatalogo = {
  negocioId: string;
  hasta: string;
  completo: boolean;
  productos: ProductoCatalogo[];
  negocio: Omit<DatosRecibo, "logo"> | null;
  logoUrl: string | null;
};

async function logoComoDatos(url: string) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const blob = await r.blob();
  return new Promise<string | null>((resolver) => {
    const lector = new FileReader();
    lector.onload = () => resolver(typeof lector.result === "string" ? lector.result : null);
    lector.onerror = () => resolver(null);
    lector.readAsDataURL(blob);
  });
}

export function ProveedorConexion({
  negocioId,
  usuario,
  ventas,
  children,
}: {
  negocioId: string | null;
  usuario: { id: string; nombre: string };
  /** Si la empresa tiene el módulo de ventas (si no, no hace falta la copia de productos). */
  ventas: boolean;
  children: React.ReactNode;
}) {
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState<VentaPendiente[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // La copia leída una vez y guardada en memoria (son miles de productos; leerla en cada búsqueda sería lento).
  const memoria = useRef<{ negocioId: string; productos: Promise<ProductoCatalogo[]> } | null>(null);
  const subiendoRef = useRef(false);
  const enLineaRef = useRef(true);

  const marcarSinConexion = useCallback(() => {
    enLineaRef.current = false;
    setEnLinea(false);
  }, []);

  const recargarPendientes = useCallback(async () => {
    try {
      setPendientes(await listarVentas());
    } catch {
      // Navegador sin IndexedDB (ventana privada antigua): no hay ventas guardadas.
    }
  }, []);

  // ─── Copia de productos ─────────────────────────────────────────────────
  const actualizarCatalogo = useCallback(async () => {
    if (!negocioId || !ventas) return;
    const meta = await leerMeta<MetaCatalogo>(`catalogo:${negocioId}`).catch(() => undefined);
    const completo = !meta || Date.now() - new Date(meta.completoEn).getTime() > COPIA_COMPLETA_CADA;
    // Un minuto de margen: una venta que se estaba guardando justo en ese momento no se pierde.
    const desde = completo ? null : new Date(new Date(meta.hasta).getTime() - 60_000).toISOString();
    const r = await fetch(`/api/caja/catalogo${desde ? `?desde=${encodeURIComponent(desde)}` : ""}`, { cache: "no-store" });
    if (!r.ok) return;
    const datos = (await r.json()) as RespuestaCatalogo;
    if (datos.negocioId !== negocioId) return; // cambió de negocio mientras tanto
    await guardarProductos(negocioId, datos.productos, datos.completo);
    await guardarMeta(`catalogo:${negocioId}`, {
      hasta: datos.hasta,
      completoEn: datos.completo ? datos.hasta : meta!.completoEn,
    } satisfies MetaCatalogo);
    if (datos.negocio) {
      const anterior = await leerMeta<DatosRecibo & { logoUrl: string | null }>(`recibo:${negocioId}`);
      const logo =
        anterior?.logoUrl === datos.logoUrl
          ? anterior.logo
          : datos.logoUrl
            ? await logoComoDatos(datos.logoUrl).catch(() => null)
            : null;
      await guardarMeta(`recibo:${negocioId}`, { ...datos.negocio, logo, logoUrl: datos.logoUrl });
    }
    memoria.current = null; // se vuelve a leer la próxima vez
  }, [negocioId, ventas]);

  const productos = useCallback(async () => {
    if (!negocioId) return [];
    if (memoria.current?.negocioId !== negocioId) {
      const lectura = leerProductos(negocioId);
      memoria.current = { negocioId, productos: lectura };
      lectura.catch(() => (memoria.current = null));
    }
    return memoria.current.productos;
  }, [negocioId]);

  const datosRecibo = useCallback(async () => {
    if (!negocioId) return null;
    return (await leerMeta<DatosRecibo>(`recibo:${negocioId}`)) ?? null;
  }, [negocioId]);

  // ─── Ventas pendientes ──────────────────────────────────────────────────
  const guardarVentaLocal = useCallback(
    async (venta: VentaPendiente) => {
      await guardarVenta(venta);
      memoria.current = null; // la caja descontó stock en la copia
      await recargarPendientes();
    },
    [recargarPendientes],
  );

  const subirPendientes = useCallback(async () => {
    if (subiendoRef.current || !enLineaRef.current) return;
    subiendoRef.current = true;
    setSubiendo(true);
    let subidas = 0;
    try {
      for (const v of await listarVentas()) {
        if (v.error && !v.reintentar) continue; // espera revisión
        try {
          const r = await subirVentaPendiente({
            negocioId: v.negocioId,
            idLocal: v.idLocal,
            numeroProvisional: v.numeroProvisional,
            creadaEn: v.creadaEn,
            vendedorId: v.vendedorId,
            lineas: v.lineas,
            descuentoGeneral: v.descuentoGeneral,
            clienteId: v.clienteId,
            total: v.total,
            pago: v.pago,
          });
          if (r.ok) {
            await borrarVenta(v.idLocal);
            subidas += 1;
          } else {
            await guardarVenta({ ...v, error: r.error, reintentar: r.reintentar });
          }
        } catch (error) {
          if (esErrorDeRed(error)) {
            marcarSinConexion();
            break;
          }
          // Error del servidor (o sin permiso): se reintenta más tarde.
          await guardarVenta({ ...v, error: "No se pudo subir. Se vuelve a intentar en un momento.", reintentar: true });
        }
      }
    } finally {
      subiendoRef.current = false;
      setSubiendo(false);
      await recargarPendientes();
      if (subidas) setAviso(`Listo: ${subidas} ${subidas === 1 ? "venta subida" : "ventas subidas"}.`);
    }
  }, [marcarSinConexion, recargarPendientes]);

  // Al abrir: ventas guardadas y copia de productos.
  useEffect(() => {
    listarVentas().then(setPendientes, () => undefined);
    actualizarCatalogo().catch((error) => {
      // La caja pudo abrir desde la copia guardada (sin internet).
      if (esErrorDeRed(error)) marcarSinConexion();
    });
  }, [actualizarCatalogo, marcarSinConexion]);

  // Sin internet: la copia se carga de una vez, así la primera búsqueda no espera.
  useEffect(() => {
    if (!enLinea && ventas) productos().catch(() => undefined);
  }, [enLinea, ventas, productos]);

  // El navegador avisa cuando se desconecta del todo (cable, wifi).
  useEffect(() => {
    const fuera = () => marcarSinConexion();
    window.addEventListener("offline", fuera);
    return () => window.removeEventListener("offline", fuera);
  }, [marcarSinConexion]);

  // Sin internet: prueba cada pocos segundos si ya volvió. Con internet: refresca la copia
  // de productos y reintenta las ventas que quedaron pendientes.
  useEffect(() => {
    if (!enLinea) {
      const probar = async () => {
        try {
          const r = await fetch("/api/caja/estado", { cache: "no-store" });
          if (r.ok) {
            enLineaRef.current = true;
            setEnLinea(true);
          }
        } catch {
          // sigue sin internet
        }
      };
      window.addEventListener("online", probar);
      const intervalo = setInterval(probar, CADA_CUANTO_PRUEBA);
      return () => {
        window.removeEventListener("online", probar);
        clearInterval(intervalo);
      };
    }
    subirPendientes();
    const intervalo = setInterval(() => {
      actualizarCatalogo().catch(() => undefined);
      subirPendientes();
    }, CADA_CUANTO_CATALOGO);
    return () => clearInterval(intervalo);
  }, [enLinea, subirPendientes, actualizarCatalogo]);

  // El aviso de "ventas subidas" se va solo.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 8000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Service worker: guarda la caja para que abra sin internet (solo en producción).
  useEffect(() => {
    if (!ventas || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      // Cada vez que se abre el sistema con internet, la copia de la caja se pone al día
      // (versión nueva del programa, otro negocio elegido).
      .then((registro) => navigator.onLine && registro.active?.postMessage("guardar-caja"))
      .catch(() => undefined);
  }, [ventas]);

  const valor = useMemo<Conexion>(
    () => ({
      enLinea,
      negocioId,
      usuario,
      pendientes,
      subiendo,
      aviso,
      marcarSinConexion,
      productos,
      datosRecibo,
      guardarVentaLocal,
      subirPendientes,
    }),
    [
      enLinea,
      negocioId,
      usuario,
      pendientes,
      subiendo,
      aviso,
      marcarSinConexion,
      productos,
      datosRecibo,
      guardarVentaLocal,
      subirPendientes,
    ],
  );

  return <ContextoConexion.Provider value={valor}>{children}</ContextoConexion.Provider>;
}
