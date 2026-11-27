import Link from "next/link";
import { Camera } from "lucide-react";
import type { ReactNode } from "react";
import type { TarjetaCatalogo } from "@/lib/catalogo/catalogo";
import { colorMuestra } from "@/lib/catalogo/colores";
import type { TiendaPublica } from "@/lib/datos/catalogo-publico";
import { formatearPesos } from "@/lib/formato";

/** foto = "<productoId>?v=<versión>" (como viene en la tarjeta). */
export function urlFotoPublica(slug: string, foto: string) {
  return `/c/${slug}/foto/${foto}`;
}

/** Clases para la letra con serifa (nombres y títulos). */
export const serif = "font-[family-name:var(--ct-serif)]";
/** Letra pequeña en mayúsculas espaciadas (etiquetas, categorías). */
export const versalitas = "text-[10.5px] font-medium tracking-[0.22em] uppercase";

export function Encabezado({ tienda, children }: { tienda: TiendaPublica; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-[var(--ct-noche)] px-4 pt-[env(safe-area-inset-top)] text-[var(--ct-acentoClaro)] shadow-md shadow-black/20 box-content">
      <Link href={`/c/${tienda.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
        {tienda.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo pequeño de la tienda
          <img src={tienda.logoUrl} alt="" className="size-10 shrink-0 rounded-full bg-black object-contain ring-1 ring-[var(--ct-acento)]/60" />
        ) : null}
        <span className="min-w-0">
          <span className={`${serif} block truncate text-[23px] leading-none font-semibold tracking-[0.16em] uppercase`}>{tienda.nombre}</span>
          <span className="mt-1 block text-[8.5px] tracking-[0.3em] text-[var(--ct-acentoClaro)]/70 uppercase">Catálogo en línea</span>
        </span>
      </Link>
      {children}
    </header>
  );
}

export function Pie({ tienda }: { tienda: TiendaPublica }) {
  return (
    <footer className="mt-12 space-y-1 border-t border-[var(--ct-borde)] px-4 pt-8 text-center text-sm text-[var(--ct-gris)]">
      <p className={`${serif} text-2xl font-semibold tracking-[0.14em] text-[var(--ct-tinta)] uppercase`}>{tienda.nombre}</p>
      {tienda.direccion && <p>{tienda.direccion}</p>}
      <p>Precios y disponibilidad se actualizan solos con el inventario de la tienda.</p>
      <p className="pt-3 text-xs">Catálogo hecho con Control Total · EMY TELECOM</p>
    </footer>
  );
}

export function Muestras({ colores, max = 5 }: { colores: { color: string; disponible: boolean }[]; max?: number }) {
  const visibles = colores.filter((c) => c.disponible);
  if (!visibles.length) return null;
  return (
    <span className="flex items-center gap-1.5 pt-1">
      {visibles.slice(0, max).map((c) => {
        const hex = colorMuestra(c.color);
        return (
          <span
            key={c.color}
            title={c.color}
            className="size-3.5 rounded-full ring-1 ring-black/15 ring-inset"
            style={{ background: hex ?? "linear-gradient(135deg,#ddd,#999)" }}
          />
        );
      })}
      {visibles.length > max && <span className="text-xs text-[var(--ct-gris)]">+{visibles.length - max}</span>}
    </span>
  );
}

export function Etiquetas({ tarjeta, grande = false }: { tarjeta: TarjetaCatalogo; grande?: boolean }) {
  const t = `${grande ? "text-[11px] px-2.5 py-1.5" : "text-[9px] px-2 py-1"} font-semibold tracking-[0.18em] uppercase`;
  return (
    <span className="flex flex-wrap gap-1">
      {tarjeta.promo && <span className={`bg-[#8c2a2a] text-white ${t}`}>{tarjeta.promo.etiqueta}</span>}
      {tarjeta.nuevo && <span className={`bg-[var(--ct-noche)] text-[var(--ct-acentoClaro)] ${t}`}>Nuevo</span>}
      {tarjeta.ultimas && <span className={`bg-[var(--ct-acentoClaro)] text-[var(--ct-noche)] ${t}`}>Últimas</span>}
    </span>
  );
}

export function Precio({ tarjeta, grande = false }: { tarjeta: TarjetaCatalogo; grande?: boolean }) {
  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 tracking-[0.04em] ${grande ? "text-[22px]" : "text-[13.5px]"}`}>
      <span className={`font-semibold ${tarjeta.precioPromo !== null ? "text-[#8c2a2a]" : ""}`}>{formatearPesos(tarjeta.precioPromo ?? tarjeta.precio)}</span>
      {tarjeta.precioPromo !== null && (
        <s className={`text-[var(--ct-gris)] ${grande ? "text-sm" : "text-[11.5px]"}`}>{formatearPesos(tarjeta.precio)}</s>
      )}
    </span>
  );
}

export function TarjetaPrenda({ tienda, tarjeta, prioridad = false }: { tienda: TiendaPublica; tarjeta: TarjetaCatalogo; prioridad?: boolean }) {
  const tallas = tarjeta.tallas.filter((t) => t.disponible).map((t) => t.talla);
  return (
    <Link href={`/c/${tienda.slug}/p/${tarjeta.clave}`} className="group block transition active:scale-[0.98]">
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--ct-suave)]">
        {tarjeta.foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- la foto ya viene achicada
          <img
            src={urlFotoPublica(tienda.slug, tarjeta.foto)}
            alt={tarjeta.nombre}
            loading={prioridad ? "eager" : "lazy"}
            className="size-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className={`${serif} flex size-full items-center justify-center text-5xl text-[var(--ct-acento)]/50`}>{tarjeta.nombre.slice(0, 1)}</span>
        )}
        <span className="absolute top-2 left-2">
          <Etiquetas tarjeta={tarjeta} />
        </span>
        {tarjeta.numFotos > 1 && (
          <>
            <span className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1" aria-hidden="true">
              {Array.from({ length: Math.min(tarjeta.numFotos, 5) }, (_, i) => (
                <i key={i} className={`h-[5px] rounded-full ${i === 0 ? "w-3.5 bg-white" : "w-[5px] bg-white/60"}`} />
              ))}
            </span>
            <span className="absolute right-2 bottom-2 flex items-center gap-1 bg-white/90 px-1.5 py-1 text-[10px] font-semibold text-[#222]">
              <Camera className="size-3" aria-hidden="true" /> {tarjeta.numFotos}
              <span className="sr-only">fotos</span>
            </span>
          </>
        )}
      </div>
      <div className="space-y-1 pt-2.5">
        <p className={`${serif} line-clamp-2 text-[18px] leading-tight font-medium`}>{tarjeta.nombre}</p>
        <Precio tarjeta={tarjeta} />
        {tallas.length > 0 && <p className="truncate text-[11px] tracking-wide text-[var(--ct-gris)]">{tallas.join(" · ")}</p>}
        {tarjeta.promo?.termina && <p className="text-[11px] font-semibold text-[#8c2a2a]">{tarjeta.promo.termina}</p>}
        <Muestras colores={tarjeta.colores} />
      </div>
    </Link>
  );
}
