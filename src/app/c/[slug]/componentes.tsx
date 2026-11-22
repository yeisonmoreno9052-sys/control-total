import Link from "next/link";
import type { ReactNode } from "react";
import type { TarjetaCatalogo } from "@/lib/catalogo/catalogo";
import { colorMuestra } from "@/lib/catalogo/colores";
import type { TiendaPublica } from "@/lib/datos/catalogo-publico";
import { formatearPesos } from "@/lib/formato";

/** foto = "<productoId>?v=<versión>" (como viene en la tarjeta). */
export function urlFotoPublica(slug: string, foto: string) {
  return `/c/${slug}/foto/${foto}`;
}

export function Encabezado({ tienda, children }: { tienda: TiendaPublica; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 bg-[var(--ct-noche)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-md shadow-black/20">
      <Link href={`/c/${tienda.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
        {tienda.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo pequeño de la tienda
          <img src={tienda.logoUrl} alt="" className="size-12 shrink-0 rounded-full bg-black object-contain ring-1 ring-[var(--ct-acento)]" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-[var(--ct-acentoClaro)]">
            {tienda.nombre.slice(0, 1)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-lg font-bold tracking-wide text-[var(--ct-acentoClaro)]">{tienda.nombre}</span>
          <span className="block text-xs text-white/60">Catálogo en línea</span>
        </span>
      </Link>
      {children}
    </header>
  );
}

export function Pie({ tienda }: { tienda: TiendaPublica }) {
  return (
    <footer className="space-y-1 px-4 pt-10 text-center text-sm text-[var(--ct-gris)]">
      <p className="font-semibold text-[var(--ct-tinta)]">{tienda.nombre}</p>
      {tienda.direccion && <p>📍 {tienda.direccion}</p>}
      <p>Precios y disponibilidad se actualizan solos con el inventario de la tienda.</p>
      <p className="pt-3 text-xs">Catálogo hecho con Control Total · EMY TELECOM</p>
    </footer>
  );
}

export function Muestras({ colores, max = 5 }: { colores: { color: string; disponible: boolean }[]; max?: number }) {
  const visibles = colores.filter((c) => c.disponible);
  if (!visibles.length) return null;
  return (
    <span className="flex items-center gap-1">
      {visibles.slice(0, max).map((c) => {
        const hex = colorMuestra(c.color);
        return (
          <span
            key={c.color}
            title={c.color}
            className="size-3.5 rounded-full ring-1 ring-black/15"
            style={{ background: hex ?? "linear-gradient(135deg,#ddd,#999)" }}
          />
        );
      })}
      {visibles.length > max && <span className="text-xs text-[var(--ct-gris)]">+{visibles.length - max}</span>}
    </span>
  );
}

export function Etiquetas({ tarjeta, grande = false }: { tarjeta: TarjetaCatalogo; grande?: boolean }) {
  const t = grande ? "text-sm px-2.5 py-1" : "text-[11px] px-2 py-0.5";
  return (
    <span className="flex flex-wrap gap-1">
      {tarjeta.promo && <span className={`rounded-lg bg-[#c62f3f] font-bold text-white ${t}`}>{tarjeta.promo.etiqueta}</span>}
      {tarjeta.nuevo && <span className={`rounded-lg bg-[var(--ct-noche)] font-bold text-[var(--ct-acentoClaro)] ${t}`}>Nuevo</span>}
      {tarjeta.ultimas && <span className={`rounded-lg bg-[#f59e0b] font-bold text-black ${t}`}>Últimas</span>}
    </span>
  );
}

export function Precio({ tarjeta, grande = false }: { tarjeta: TarjetaCatalogo; grande?: boolean }) {
  return (
    <span className={`flex flex-wrap items-baseline gap-x-1.5 ${grande ? "text-3xl" : "text-base"}`}>
      <span className={`font-extrabold ${tarjeta.precioPromo !== null ? "text-[#c62f3f]" : ""}`}>
        {formatearPesos(tarjeta.precioPromo ?? tarjeta.precio)}
      </span>
      {tarjeta.precioPromo !== null && (
        <s className={`text-[var(--ct-gris)] ${grande ? "text-base" : "text-xs"}`}>{formatearPesos(tarjeta.precio)}</s>
      )}
    </span>
  );
}

export function TarjetaPrenda({ tienda, tarjeta, prioridad = false }: { tienda: TiendaPublica; tarjeta: TarjetaCatalogo; prioridad?: boolean }) {
  const tallas = tarjeta.tallas.filter((t) => t.disponible).map((t) => t.talla);
  return (
    <Link
      href={`/c/${tienda.slug}/p/${tarjeta.clave}`}
      className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[var(--ct-borde)] transition active:scale-[0.98]"
    >
      <div className="relative aspect-[4/5] bg-[var(--ct-suave)]">
        {tarjeta.foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- la foto ya viene achicada
          <img
            src={urlFotoPublica(tienda.slug, tarjeta.foto)}
            alt={tarjeta.nombre}
            loading={prioridad ? "eager" : "lazy"}
            className="size-full object-cover transition group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-4xl font-bold text-[var(--ct-acento)]/50">
            {tarjeta.nombre.slice(0, 1)}
          </span>
        )}
        <span className="absolute top-2 left-2">
          <Etiquetas tarjeta={tarjeta} />
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm leading-snug font-semibold">{tarjeta.nombre}</p>
        <Precio tarjeta={tarjeta} />
        {tarjeta.promo?.termina && <p className="text-xs font-semibold text-[#c62f3f]">⏳ {tarjeta.promo.termina}</p>}
        {tallas.length > 0 && <p className="truncate text-xs text-[var(--ct-gris)]">Tallas {tallas.join(" · ")}</p>}
        <Muestras colores={tarjeta.colores} />
      </div>
    </Link>
  );
}
