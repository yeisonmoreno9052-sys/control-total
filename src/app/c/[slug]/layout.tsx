import { Suspense } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ProveedorBolsa } from "./bolsa";
import { estiloTema } from "./tema";
import { tiendaDe } from "./tienda";

// Letras del catálogo: una con serifa para nombres y títulos (de revista de moda) y una
// limpia para precios y botones. Solo se cargan en el catálogo, no en la app.
const serifa = Cormorant_Garamond({ variable: "--ct-serif", subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"] });
const limpia = Montserrat({ variable: "--ct-sans", subsets: ["latin"], weight: ["400", "500", "600"] });

// El catálogo se lee de la base en cada visita (precios y tallas al día), así que carga
// dentro de un <Suspense>: mientras llega, se ve un esqueleto y no una pantalla en blanco.
export default function LayoutCatalogo({ children, params }: LayoutProps<"/c/[slug]">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Marco params={params}>{children}</Marco>
    </Suspense>
  );
}

async function Marco({ children, params }: { children: React.ReactNode; params: LayoutProps<"/c/[slug]">["params"] }) {
  const tienda = await tiendaDe((await params).slug);
  // Si el link no sirve, la página muestra "no disponible" (not-found.tsx).
  if (!tienda) return children;
  return (
    <div
      id="catalogo-raiz"
      style={estiloTema(tienda.paleta)}
      className={`${serifa.variable} ${limpia.variable} min-h-dvh bg-[var(--ct-fondo)] font-[family-name:var(--ct-sans)] text-[var(--ct-tinta)]`}
    >
      <ProveedorBolsa slug={tienda.slug} tienda={tienda.nombre} whatsapp={tienda.whatsapp}>
        {children}
      </ProveedorBolsa>
    </div>
  );
}

function Cargando() {
  return (
    <div className="min-h-dvh bg-[#f7f2ea]" aria-busy="true" aria-label="Cargando el catálogo">
      <div className="h-16 bg-[#0d0c0b]" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-4">
        <div className="h-12 animate-pulse rounded-2xl bg-black/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[4/6] animate-pulse rounded-2xl bg-black/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
