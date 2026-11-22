import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { categoriasCatalogo, FILTROS, hayPromociones, listarCatalogo, type FiltroCatalogo } from "@/lib/datos/catalogo-publico";
import { urlPublica } from "@/lib/url-publica";
import { BarraInferior, BotonBolsa, IconoWhatsapp } from "./bolsa";
import { Encabezado, Pie, TarjetaPrenda } from "./componentes";
import { tiendaDe } from "./tienda";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const tienda = await tiendaDe((await params).slug);
  if (!tienda) return { title: "Catálogo no disponible" };
  const base = await urlPublica();
  const titulo = `${tienda.nombre} · Catálogo`;
  const descripcion = `Mira todas las prendas de ${tienda.nombre} con tallas, colores y precios. Pide por WhatsApp.`;
  return {
    title: titulo,
    description: descripcion,
    openGraph: {
      title: titulo,
      description: descripcion,
      url: `${base}/c/${tienda.slug}`,
      siteName: tienda.nombre,
      locale: "es_CO",
      type: "website",
      images: tienda.logoUrl ? [{ url: `${base}${tienda.logoUrl}`, width: 400, height: 400, alt: tienda.nombre }] : undefined,
    },
  };
}

/** Grupos de categorías: "Mujer - Jeans" y "Mujer - Blusas" van en "Mujer". */
function agrupar(categorias: string[]) {
  const grupos = new Map<string, string[]>();
  for (const c of categorias) {
    const [grupo, ...resto] = c.split(" - ");
    const lista = grupos.get(grupo) ?? [];
    if (resto.length) lista.push(c);
    grupos.set(grupo, lista);
  }
  return grupos;
}

const TITULOS: Record<FiltroCatalogo, string> = {
  nuevo: "✨ Lo nuevo",
  promo: "🔥 Promociones",
  ultimas: "⏳ Últimas unidades",
};

async function Catalogo({ params, searchParams }: PageProps<"/c/[slug]">) {
  const tienda = await tiendaDe((await params).slug);
  if (!tienda) notFound();
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = uno(sp.q).slice(0, 80);
  const cat = uno(sp.cat).slice(0, 100);
  const f = uno(sp.f);
  const filtro = (FILTROS as readonly string[]).includes(f) ? (f as FiltroCatalogo) : undefined;
  const pagina = Math.max(1, Number(uno(sp.pagina)) || 1);

  const [{ tarjetas, total, paginas }, categorias, promos] = await Promise.all([
    listarCatalogo(tienda, { q, categoria: cat, filtro, pagina }),
    categoriasCatalogo(tienda),
    hayPromociones(tienda),
  ]);
  const grupos = agrupar(categorias);
  const grupoActivo = cat.split(" - ")[0];
  const subcategorias = grupoActivo ? (grupos.get(grupoActivo) ?? []) : [];

  const href = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const todo = { q: q || undefined, cat: cat || undefined, f: filtro, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v) p.set(k, v);
    const s = p.toString();
    return `/c/${tienda.slug}${s ? `?${s}` : ""}`;
  };
  const chip = (activo: boolean) =>
    `flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap ring-1 ${
      activo ? "bg-[var(--ct-noche)] text-[var(--ct-acentoClaro)] ring-[var(--ct-noche)]" : "bg-white text-[var(--ct-tinta)] ring-[var(--ct-borde)]"
    }`;

  const titulo = q
    ? `Resultados para "${q}"`
    : filtro
      ? TITULOS[filtro]
      : cat
        ? cat.replace(" - ", " · ")
        : "✨ Lo más nuevo";

  return (
    <main className="mx-auto max-w-5xl pb-28">
      <Encabezado tienda={tienda}>
        {tienda.whatsapp && (
          <a
            href={`https://wa.me/${tienda.whatsapp}`}
            target="_blank"
            rel="noopener"
            aria-label="Escribir por WhatsApp"
            className="flex size-11 items-center justify-center rounded-full bg-[#25d366] text-white"
          >
            <IconoWhatsapp className="size-6" />
          </a>
        )}
        <BotonBolsa />
      </Encabezado>

      <form action={`/c/${tienda.slug}`} className="px-4 pt-4">
        {cat && <input type="hidden" name="cat" value={cat} />}
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-white px-4 ring-1 ring-[var(--ct-borde)] focus-within:ring-2 focus-within:ring-[var(--ct-acento)]">
          <Search className="size-5 text-[var(--ct-gris)]" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Busca jean, vestido, blusa…"
            aria-label="Buscar en el catálogo"
            className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-[var(--ct-gris)]"
          />
        </label>
      </form>

      <nav aria-label="Filtros" className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none]">
        <Link href={`/c/${tienda.slug}`} className={chip(!cat && !filtro && !q)}>
          Todo
        </Link>
        <Link href={href({ f: "nuevo", cat: undefined, q: undefined, pagina: undefined })} className={chip(filtro === "nuevo")}>
          Lo nuevo
        </Link>
        {promos && (
          <Link href={href({ f: "promo", cat: undefined, q: undefined })} className={chip(filtro === "promo")}>
            🔥 Promociones
          </Link>
        )}
        {[...grupos.keys()].map((g) => (
          <Link key={g} href={href({ cat: g, f: undefined, q: undefined })} className={chip(grupoActivo === g && !!cat)}>
            {g}
          </Link>
        ))}
        <Link href={href({ f: "ultimas", cat: undefined, q: undefined })} className={chip(filtro === "ultimas")}>
          Últimas unidades
        </Link>
      </nav>
      {subcategorias.length > 0 && (
        <nav aria-label={`Categorías de ${grupoActivo}`} className="flex gap-2 overflow-x-auto px-4 pt-2 [scrollbar-width:none]">
          <Link href={href({ cat: grupoActivo })} className={chip(cat === grupoActivo)}>
            Todo {grupoActivo}
          </Link>
          {subcategorias.map((c) => (
            <Link key={c} href={href({ cat: c })} className={chip(cat === c)}>
              {c.split(" - ").slice(1).join(" - ")}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex items-baseline justify-between px-4 pt-5 pb-3">
        <h1 className="text-lg font-bold">{titulo}</h1>
        <span className="text-sm text-[var(--ct-gris)]">
          {total} {total === 1 ? "prenda" : "prendas"}
        </span>
      </div>

      {tarjetas.length === 0 ? (
        <div className="mx-4 space-y-3 rounded-3xl bg-white p-8 text-center ring-1 ring-[var(--ct-borde)]">
          <p className="text-4xl">🔎</p>
          <p className="font-semibold">No encontramos prendas con eso</p>
          <p className="text-sm text-[var(--ct-gris)]">Prueba con otra palabra o escríbenos: te ayudamos a encontrarla.</p>
          <Link href={`/c/${tienda.slug}`} className="inline-flex h-11 items-center rounded-xl bg-[var(--ct-noche)] px-5 font-semibold text-white">
            Ver todo el catálogo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-4">
          {tarjetas.map((t, i) => (
            <TarjetaPrenda key={t.clave} tienda={tienda} tarjeta={t} prioridad={i < 4} />
          ))}
        </div>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 pt-6">
          {pagina > 1 && (
            <Link href={href({ pagina: String(pagina - 1) })} className="h-12 rounded-xl bg-white px-5 leading-[3rem] font-semibold ring-1 ring-[var(--ct-borde)]">
              ← Anteriores
            </Link>
          )}
          <span className="text-sm text-[var(--ct-gris)]">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={href({ pagina: String(pagina + 1) })} className="h-12 rounded-xl bg-[var(--ct-noche)] px-5 leading-[3rem] font-semibold text-white">
              Ver más →
            </Link>
          )}
        </div>
      )}

      <Pie tienda={tienda} />
      <BarraInferior />
    </main>
  );
}

export default function PaginaCatalogo(props: PageProps<"/c/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Catalogo {...props} />
    </Suspense>
  );
}
