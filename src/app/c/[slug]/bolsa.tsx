"use client";

// Bolsa de compras del catálogo: el cliente junta varias prendas y manda un solo
// WhatsApp con todo el pedido. Se guarda en este celular (no en el servidor).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { describirLinea, linkWhatsapp, mensajePedido, type LineaPedido } from "@/lib/catalogo/catalogo";
import { formatearPesos } from "@/lib/formato";

export type ItemBolsa = {
  /** Producto exacto (talla y color). */
  productoId: string;
  /** Prenda, para contar el pedido. */
  clave: string;
  nombre: string;
  talla: string | null;
  color: string | null;
  precio: number;
  cantidad: number;
  foto: string | null;
  link: string;
};

type Bolsa = {
  items: ItemBolsa[];
  agregar: (item: Omit<ItemBolsa, "cantidad">) => void;
  cambiar: (productoId: string, cantidad: number) => void;
  abrir: () => void;
  /** Cuenta el pedido y abre WhatsApp con el mensaje. */
  pedir: (lineas: LineaPedido[], claves: string[]) => void;
  slug: string;
  tienda: string;
  whatsapp: string | null;
};

const Contexto = createContext<Bolsa | null>(null);

export function useBolsa() {
  const b = useContext(Contexto);
  if (!b) throw new Error("useBolsa fuera del catálogo");
  return b;
}

const MAX_ITEMS = 30;

function leer(clave: string): ItemBolsa[] {
  try {
    const crudo = localStorage.getItem(clave);
    const lista = crudo ? (JSON.parse(crudo) as ItemBolsa[]) : [];
    return Array.isArray(lista) ? lista.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

const montado = () => () => {};

export function contarEvento(slug: string, tipo: "vista" | "pedido", claves: string[]) {
  try {
    const cuerpo = JSON.stringify({ tipo, claves });
    if (navigator.sendBeacon?.(`/c/${slug}/evento`, new Blob([cuerpo], { type: "application/json" }))) return;
    void fetch(`/c/${slug}/evento`, { method: "POST", body: cuerpo, keepalive: true, headers: { "Content-Type": "application/json" } });
  } catch {
    // Contar es opcional: el pedido sigue aunque falle.
  }
}

export function ProveedorBolsa({ slug, tienda, whatsapp, children }: { slug: string; tienda: string; whatsapp: string | null; children: ReactNode }) {
  const llave = `ct-bolsa:${slug}`;
  const [items, setItems] = useState<ItemBolsa[]>([]);
  const [abierta, setAbierta] = useState(false);
  const enCliente = useSyncExternalStore(montado, () => true, () => false);

  useEffect(() => {
    const t = setTimeout(() => setItems(leer(llave)), 0);
    return () => clearTimeout(t);
  }, [llave]);

  const guardar = useCallback(
    (nuevos: ItemBolsa[]) => {
      setItems(nuevos);
      try {
        localStorage.setItem(llave, JSON.stringify(nuevos));
      } catch {
        // Sin almacenamiento (modo privado): la bolsa dura mientras la página esté abierta.
      }
    },
    [llave],
  );

  const pedir = useCallback(
    (lineas: LineaPedido[], claves: string[]) => {
      if (!whatsapp) return;
      contarEvento(slug, "pedido", claves);
      window.open(linkWhatsapp(whatsapp, mensajePedido(tienda, lineas)), "_blank", "noopener");
    },
    [slug, tienda, whatsapp],
  );

  const valor = useMemo<Bolsa>(
    () => ({
      items,
      slug,
      tienda,
      whatsapp,
      pedir,
      abrir: () => setAbierta(true),
      agregar: (item) => {
        const actual = leer(llave);
        const ya = actual.find((i) => i.productoId === item.productoId);
        const nuevos = ya
          ? actual.map((i) => (i.productoId === item.productoId ? { ...i, cantidad: Math.min(20, i.cantidad + 1) } : i))
          : [...actual, { ...item, cantidad: 1 }].slice(-MAX_ITEMS);
        guardar(nuevos);
      },
      cambiar: (productoId, cantidad) => {
        const nuevos = leer(llave)
          .map((i) => (i.productoId === productoId ? { ...i, cantidad: Math.min(20, cantidad) } : i))
          .filter((i) => i.cantidad > 0);
        guardar(nuevos);
      },
    }),
    [items, slug, tienda, whatsapp, pedir, llave, guardar],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      {enCliente && abierta && <PanelBolsa cerrar={() => setAbierta(false)} />}
    </Contexto.Provider>
  );
}

/** Botón de la bolsa para el encabezado, con cuántas prendas lleva. */
export function BotonBolsa() {
  const { items, abrir } = useBolsa();
  const n = items.reduce((s, i) => s + i.cantidad, 0);
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label={n ? `Ver mi bolsa: ${n} prendas` : "Ver mi bolsa"}
      className="relative flex size-11 items-center justify-center rounded-full bg-white/10 text-[var(--ct-acentoClaro)] ring-1 ring-white/15"
    >
      <ShoppingBag className="size-5" />
      {n > 0 && (
        <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1 text-xs font-bold text-white">
          {n}
        </span>
      )}
    </button>
  );
}

/** Barra de abajo: si hay algo en la bolsa, "Ver mi pedido"; si no, escribir por WhatsApp. */
export function BarraInferior({ soloBolsa = false }: { soloBolsa?: boolean }) {
  const { items, abrir, whatsapp, tienda } = useBolsa();
  const n = items.reduce((s, i) => s + i.cantidad, 0);
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  if (n > 0) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={abrir}
          className="mx-auto flex h-14 w-full max-w-xl items-center justify-between rounded-2xl bg-[var(--ct-noche)] px-5 text-base font-bold text-white shadow-xl shadow-black/25"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="size-5 text-[var(--ct-acentoClaro)]" /> Ver mi pedido ({n})
          </span>
          <span className="text-[var(--ct-acentoClaro)]">{formatearPesos(total)}</span>
        </button>
      </div>
    );
  }
  // En la página de una prenda ya está "Pedir por WhatsApp": no se repite abajo.
  if (!whatsapp || soloBolsa) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <a
        href={linkWhatsapp(whatsapp, `¡Hola ${tienda}! Vi el catálogo y quiero preguntar por una prenda.`)}
        target="_blank"
        rel="noopener"
        className="mx-auto flex h-14 w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-base font-bold text-white shadow-xl shadow-[#25d366]/30"
      >
        <IconoWhatsapp className="size-6" /> Escríbenos por WhatsApp
      </a>
    </div>
  );
}

function PanelBolsa({ cerrar }: { cerrar: () => void }) {
  const { items, cambiar, pedir, whatsapp } = useBolsa();
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [cerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={cerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mi bolsa"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-[var(--ct-fondo)] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--ct-borde)] px-5 py-4">
          <h2 className="text-xl font-bold">Mi bolsa</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="flex size-10 items-center justify-center rounded-full bg-black/5">
            <X className="size-5" />
          </button>
        </div>
        {items.length === 0 ? (
          <div className="space-y-2 px-6 py-12 text-center">
            <p className="text-4xl">🛍️</p>
            <p className="font-semibold">Tu bolsa está vacía</p>
            <p className="text-sm text-[var(--ct-gris)]">Escoge una prenda, su talla y su color, y toca &quot;Agregar a la bolsa&quot;.</p>
            <button type="button" onClick={cerrar} className="mt-3 h-12 rounded-xl bg-[var(--ct-noche)] px-6 font-semibold text-white">
              Ver el catálogo
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-[var(--ct-borde)] overflow-y-auto px-5">
              {items.map((i) => (
                <li key={i.productoId} className="flex items-center gap-3 py-3">
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-[var(--ct-suave)]">
                    {i.foto && (
                      // eslint-disable-next-line @next/next/no-img-element -- foto ya achicada al subirla
                      <img src={i.foto} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{i.nombre}</p>
                    <p className="text-sm text-[var(--ct-gris)]">{describirLinea({ nombre: "", talla: i.talla, color: i.color }).replace(/^ · /, "") || " "}</p>
                    <p className="font-bold">{formatearPesos(i.precio * i.cantidad)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => cambiar(i.productoId, i.cantidad - 1)}
                      aria-label={i.cantidad === 1 ? "Quitar" : "Una menos"}
                      className="flex size-10 items-center justify-center rounded-full border border-[var(--ct-borde)] bg-white"
                    >
                      {i.cantidad === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                    </button>
                    <span className="w-6 text-center font-bold">{i.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => cambiar(i.productoId, i.cantidad + 1)}
                      aria-label="Una más"
                      className="flex size-10 items-center justify-center rounded-full border border-[var(--ct-borde)] bg-white"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="space-y-3 border-t border-[var(--ct-borde)] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex items-baseline justify-between">
                <span className="text-[var(--ct-gris)]">Total</span>
                <span className="text-2xl font-extrabold">{formatearPesos(total)}</span>
              </div>
              {whatsapp ? (
                <button
                  type="button"
                  onClick={() =>
                    pedir(
                      items.map((i) => ({ nombre: i.nombre, talla: i.talla, color: i.color, cantidad: i.cantidad, precio: i.precio, link: i.link })),
                      items.map((i) => i.clave),
                    )
                  }
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-lg font-bold text-white"
                >
                  <IconoWhatsapp className="size-6" /> Enviar pedido por WhatsApp
                </button>
              ) : (
                <p className="text-center text-sm text-[var(--ct-gris)]">Pídele a la tienda su número de WhatsApp.</p>
              )}
              <p className="text-center text-xs text-[var(--ct-gris)]">La tienda te confirma por WhatsApp si todo está disponible.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function IconoWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.04 2a9.93 9.93 0 0 0-8.52 15.05L2 22l5.08-1.33A9.94 9.94 0 1 0 12.04 2Zm5.8 14.13c-.24.69-1.42 1.32-1.96 1.36-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.28.25-.27.54-.34.72-.34h.52c.17 0 .4-.06.62.47.24.55.8 1.89.87 2.03.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.2 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.61-.14.25.09 1.58.75 1.85.88.27.14.45.2.52.32.07.11.07.66-.17 1.35Z" />
    </svg>
  );
}
