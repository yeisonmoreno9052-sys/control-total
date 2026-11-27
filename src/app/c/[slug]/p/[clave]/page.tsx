import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { obtenerTarjeta, parecidas } from "@/lib/datos/catalogo-publico";
import { formatearPesos } from "@/lib/formato";
import { urlPublica } from "@/lib/url-publica";
import { BarraInferior, BotonBolsa } from "../../bolsa";
import { Encabezado, Etiquetas, Pie, Precio, serif, TarjetaPrenda, urlFotoPublica, versalitas } from "../../componentes";
import { tiendaDe } from "../../tienda";
import { SelectorPrenda } from "./selector";

export async function generateMetadata({ params }: PageProps<"/c/[slug]/p/[clave]">): Promise<Metadata> {
  const { slug, clave } = await params;
  const tienda = await tiendaDe(slug);
  const t = tienda ? await obtenerTarjeta(tienda, clave) : null;
  if (!tienda || !t) return { title: "Prenda no disponible" };
  const base = await urlPublica();
  const titulo = `${t.nombre} · ${formatearPesos(t.precioPromo ?? t.precio)}`;
  const tallas = t.tallas.filter((x) => x.disponible).map((x) => x.talla);
  const descripcion = `${tienda.nombre}${tallas.length ? ` · Tallas ${tallas.join(", ")}` : ""}. Pídela por WhatsApp.`;
  const imagen = t.foto ? `${base}${urlFotoPublica(tienda.slug, t.foto)}` : tienda.logoUrl ? `${base}${tienda.logoUrl}` : undefined;
  return {
    title: titulo,
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, url: `${base}/c/${tienda.slug}/p/${t.clave}`, siteName: tienda.nombre, locale: "es_CO", images: imagen ? [imagen] : undefined },
  };
}

async function Prenda({ params }: PageProps<"/c/[slug]/p/[clave]">) {
  const { slug, clave } = await params;
  const tienda = await tiendaDe(slug);
  if (!tienda) notFound();
  const tarjeta = await obtenerTarjeta(tienda, clave);
  if (!tarjeta) {
    return (
      <main className="mx-auto max-w-5xl pb-28">
        <Encabezado tienda={tienda}>
          <BotonBolsa />
        </Encabezado>
        <div className="mx-4 mt-8 space-y-3 bg-white p-8 text-center ring-1 ring-[var(--ct-borde)]">
          <p className={`${serif} text-3xl font-medium`}>Esta prenda ya se agotó</p>
          <p className="text-sm text-[var(--ct-gris)]">Mira lo que tenemos ahora: llegan prendas nuevas seguido.</p>
          <Link href={`/c/${tienda.slug}`} className="inline-flex h-12 items-center bg-[var(--ct-noche)] px-6 text-xs font-semibold tracking-[0.18em] text-[var(--ct-acentoClaro)] uppercase">
            Ver el catálogo
          </Link>
        </div>
        <BarraInferior />
      </main>
    );
  }
  const [otras, base] = await Promise.all([parecidas(tienda, tarjeta), urlPublica()]);

  return (
    <main className="mx-auto max-w-5xl pb-28">
      <Encabezado tienda={tienda}>
        <BotonBolsa />
      </Encabezado>
      <SelectorPrenda
          sobreFoto={
            <>
              <Link
                href={`/c/${tienda.slug}`}
                aria-label="Volver al catálogo"
                className="absolute top-3 left-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/92 shadow-md"
              >
                <ChevronLeft className="size-6" />
              </Link>
              <span className="absolute top-4 right-3 z-10">
                <Etiquetas tarjeta={tarjeta} grande />
              </span>
            </>
          }
          slug={tienda.slug}
          marcaAgua={tienda.marcaAgua ? tienda.logoUrl : null}
          tarjeta={tarjeta}
          mostrarCantidad={tienda.mostrarCantidad}
          hayWhatsapp={!!tienda.whatsapp}
          linkPrenda={`${base}/c/${tienda.slug}/p/${tarjeta.clave}`}
          cabecera={
            <>
              {tarjeta.categoria && <p className={`${versalitas} text-[var(--ct-acento)]`}>{tarjeta.categoria.replace(" - ", " · ")}</p>}
              <h1 className={`${serif} text-[34px] leading-[1.05] font-medium`}>{tarjeta.nombre}</h1>
              <Precio tarjeta={tarjeta} grande />
              {tarjeta.promo && (
                <p className="inline-flex bg-[#8c2a2a]/10 px-3 py-1.5 text-[13px] font-medium text-[#8c2a2a]">
                  {tarjeta.promo.nombre}
                  {tarjeta.promo.termina ? ` · ${tarjeta.promo.termina}` : ""}
                </p>
              )}
            </>
          }
        />

      {otras.length > 0 && (
        <section className="pt-8">
          <h2 className={`${serif} px-4 pb-4 text-[28px] font-medium`}>
            También te puede <i className="text-[var(--ct-acento)]">gustar</i>
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 px-4 sm:grid-cols-3 lg:grid-cols-6">
            {otras.map((t) => (
              <TarjetaPrenda key={t.clave} tienda={tienda} tarjeta={t} />
            ))}
          </div>
        </section>
      )}
      <Pie tienda={tienda} />
      <BarraInferior soloBolsa />
    </main>
  );
}

export default function PaginaPrenda(props: PageProps<"/c/[slug]/p/[clave]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Prenda {...props} />
    </Suspense>
  );
}
