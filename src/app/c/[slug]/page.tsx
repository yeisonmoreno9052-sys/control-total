import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { categoriasCatalogo, FILTROS, hayPromociones, listarCatalogo, type FiltroCatalogo } from "@/lib/datos/catalogo-publico";
import { diaEnBogota } from "@/lib/formato";
import { urlPublica } from "@/lib/url-publica";
import { BarraInferior, BotonBolsa, IconoWhatsapp } from "./bolsa";
import { Encabezado, Pie, serif, TarjetaPrenda, urlFotoPublica, versalitas } from "./componentes";
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
  nuevo: "Lo nuevo",
  promo: "Promociones",
  ultimas: "Últimas unidades",
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

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
  // Pestañas de texto con una raya dorada debajo de la escogida.
  const chip = (activo: boolean) =>
    `flex h-10 shrink-0 items-center border-b-[1.5px] text-[13px] whitespace-nowrap ${
      activo ? "border-[var(--ct-acento)] font-semibold text-[var(--ct-tinta)]" : "border-transparent text-[var(--ct-gris)]"
    }`;

  const titulo = q
    ? `Resultados para "${q}"`
    : filtro
      ? TITULOS[filtro]
      : cat
        ? cat.replace(" - ", " · ")
        : null;
  // Portada solo en la entrada del catálogo, con la foto de la prenda más nueva.
  const portada = !q && !filtro && !cat && pagina === 1 ? tarjetas.find((t) => t.foto) : undefined;
  const mes = MESES[Number(diaEnBogota().slice(5, 7)) - 1];

  return (
    <main className="mx-auto max-w-5xl pb-28">
      <Encabezado tienda={tienda}>
        {tienda.whatsapp && (
          <a
            href={`https://wa.me/${tienda.whatsapp}`}
            target="_blank"
            rel="noopener"
            aria-label="Escribir por WhatsApp"
            className="flex size-10 items-center justify-center rounded-full text-[var(--ct-acentoClaro)] ring-1 ring-[var(--ct-acentoClaro)]/40"
          >
            <IconoWhatsapp className="size-5" />
          </a>
        )}
        <BotonBolsa />
      </Encabezado>

      {portada && (
        <section className="relative h-60 overflow-hidden bg-[var(--ct-noche)] text-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- la foto ya viene achicada */}
          <img src={urlFotoPublica(tienda.slug, portada.foto!)} alt="" className="absolute top-0 right-0 h-full w-3/5 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--ct-noche)] from-40% to-transparent to-80%" />
          <div className="absolute inset-x-5 bottom-6">
            <p className={`${versalitas} text-[var(--ct-acentoClaro)]`}>Colección de {mes}</p>
            <p className={`${serif} mt-2 mb-4 text-[40px] leading-[1.02] font-medium`}>
              Descubre
              <br />
              lo <i className="text-[var(--ct-acentoClaro)]">nuevo</i>
            </p>
            <Link
              href={`/c/${tienda.slug}/p/${portada.clave}`}
              className="inline-flex h-10 items-center border border-white/80 px-5 text-[11px] font-medium tracking-[0.2em] uppercase"
            >
              Ver la prenda
            </Link>
          </div>
        </section>
      )}

      <form action={`/c/${tienda.slug}`} className="px-4 pt-4">
        {cat && <input type="hidden" name="cat" value={cat} />}
        <label className="flex h-12 items-center gap-2.5 border-b border-[var(--ct-tinta)]/70 focus-within:border-[var(--ct-acento)]">
          <Search className="size-5 text-[var(--ct-gris)]" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Busca jean, vestido, blusa…"
            aria-label="Buscar en el catálogo"
            className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-[var(--ct-gris)] placeholder:text-sm"
          />
        </label>
      </form>

      <nav aria-label="Filtros" className="flex gap-6 overflow-x-auto px-4 pt-2 [scrollbar-width:none]">
        <Link href={`/c/${tienda.slug}`} className={chip(!cat && !filtro && !q)}>
          Todo
        </Link>
        <Link href={href({ f: "nuevo", cat: undefined, q: undefined, pagina: undefined })} className={chip(filtro === "nuevo")}>
          Lo nuevo
        </Link>
        {promos && (
          <Link href={href({ f: "promo", cat: undefined, q: undefined })} className={chip(filtro === "promo")}>
            Promociones
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
        <nav aria-label={`Categorías de ${grupoActivo}`} className="flex gap-6 overflow-x-auto px-4 pt-1 [scrollbar-width:none]">
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

      <div className="flex items-baseline justify-between gap-3 px-4 pt-6 pb-3">
        <h1 className={`${serif} text-[28px] leading-tight font-medium`}>
          {titulo ?? (
            <>
              Lo más <i className="text-[var(--ct-acento)]">nuevo</i>
            </>
          )}
        </h1>
        <span className="shrink-0 text-xs text-[var(--ct-gris)]">
          {total} {total === 1 ? "prenda" : "prendas"}
        </span>
      </div>

      {tarjetas.length === 0 ? (
        <div className="mx-4 space-y-3 bg-white p-8 text-center ring-1 ring-[var(--ct-borde)]">
          <p className={`${serif} text-2xl font-medium`}>No encontramos prendas con eso</p>
          <p className="text-sm text-[var(--ct-gris)]">Prueba con otra palabra o escríbenos: te ayudamos a encontrarla.</p>
          <Link href={`/c/${tienda.slug}`} className="inline-flex h-11 items-center bg-[var(--ct-noche)] px-5 text-xs font-semibold tracking-[0.18em] text-[var(--ct-acentoClaro)] uppercase">
            Ver todo el catálogo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 px-4 sm:grid-cols-3 lg:grid-cols-4">
          {tarjetas.map((t, i) => (
            <TarjetaPrenda key={t.clave} tienda={tienda} tarjeta={t} prioridad={i < 4} />
          ))}
        </div>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 pt-6">
          {pagina > 1 && (
            <Link href={href({ pagina: String(pagina - 1) })} className="h-12 border border-[var(--ct-tinta)] px-5 text-sm leading-[3rem] font-medium">
              ← Anteriores
            </Link>
          )}
          <span className="text-sm text-[var(--ct-gris)]">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas && (
            <Link href={href({ pagina: String(pagina + 1) })} className="h-12 bg-[var(--ct-noche)] px-5 text-sm leading-[3rem] font-semibold text-[var(--ct-acentoClaro)]">
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
