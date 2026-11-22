"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BellRing, Check, ShoppingBag } from "lucide-react";
import { ordenTalla, type TarjetaCatalogo, type VarianteCatalogo } from "@/lib/catalogo/catalogo";
import { colorMuestra } from "@/lib/catalogo/colores";
import { normalizar } from "@/lib/inventario/prendas";
import { contarEvento, IconoWhatsapp, useBolsa } from "../../bolsa";

const igual = (a: string | null | undefined, b: string | null | undefined) => normalizar(a ?? "") === normalizar(b ?? "");

export function SelectorPrenda({
  slug,
  tarjeta,
  mostrarCantidad,
  hayWhatsapp,
  linkPrenda,
  cabecera,
  sobreFoto,
}: {
  slug: string;
  tarjeta: TarjetaCatalogo;
  mostrarCantidad: boolean;
  hayWhatsapp: boolean;
  linkPrenda: string;
  cabecera: ReactNode;
  sobreFoto: ReactNode;
}) {
  const { agregar, pedir, abrir } = useBolsa();
  const tallas = useMemo(() => [...tarjeta.tallas].sort((a, b) => ordenTalla(a.talla, b.talla)), [tarjeta.tallas]);
  const colores = tarjeta.colores;
  const [talla, setTalla] = useState<string | null>(() => (tallas.length === 1 ? tallas[0].talla : null));
  const [color, setColor] = useState<string | null>(() => colores.find((c) => c.disponible)?.color ?? colores[0]?.color ?? null);
  const [falta, setFalta] = useState(false);
  const [agregada, setAgregada] = useState(false);

  // Una vista por prenda y por visita.
  useEffect(() => {
    const llave = `ct-vista:${slug}:${tarjeta.clave}`;
    try {
      if (sessionStorage.getItem(llave)) return;
      sessionStorage.setItem(llave, "1");
    } catch {
      // sin almacenamiento: se cuenta igual
    }
    contarEvento(slug, "vista", [tarjeta.clave]);
  }, [slug, tarjeta.clave]);

  const hayStock = (v: VarianteCatalogo) => v.stock > 0;
  const variantesDe = (t: string | null, c: string | null) =>
    tarjeta.variantes.filter((v) => (!tallas.length || !t || igual(v.talla, t)) && (!colores.length || !c || igual(v.color, c)));
  const tallaDisponible = (t: string) => variantesDe(t, color).some(hayStock);
  const colorDisponible = (c: string) => variantesDe(talla, c).some(hayStock);

  const completa = (!tallas.length || !!talla) && (!colores.length || !!color);
  const variante = completa ? (variantesDe(talla, color)[0] ?? null) : null;
  const agotada = completa && (!variante || variante.stock <= 0);

  // Fotos: la del color escogido primero; abajo, una por color.
  const fotos = useMemo(() => {
    const lista: { foto: string; color: string | null }[] = [];
    for (const v of tarjeta.variantes) if (v.foto && !lista.some((f) => f.foto.split("?")[0] === v.foto!.split("?")[0] || (v.color && igual(f.color, v.color)))) lista.push({ foto: v.foto, color: v.color });
    return lista;
  }, [tarjeta.variantes]);
  const [fotoElegida, setFotoElegida] = useState<string | null>(null);
  const fotoColor = color ? fotos.find((f) => igual(f.color, color))?.foto : null;
  const foto = fotoElegida ?? fotoColor ?? tarjeta.foto;

  const precio = variante ? (variante.precioPromo ?? variante.precio) : (tarjeta.precioPromo ?? tarjeta.precio);

  const exigir = () => {
    if (completa) return true;
    setFalta(true);
    return false;
  };
  const linea = () => ({ nombre: tarjeta.nombre, talla: variante?.talla ?? null, color: variante?.color ?? null, cantidad: 1, precio, link: linkPrenda });

  return (
    <div className="md:grid md:grid-cols-2 md:gap-8 md:px-4 md:pt-6">
      <div>
        <div className="relative aspect-[4/5] bg-[var(--ct-suave)] md:overflow-hidden md:rounded-3xl">
          {sobreFoto}
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element -- la foto ya viene achicada
            <img src={`/c/${slug}/foto/${foto}`} alt={tarjeta.nombre} className="size-full object-contain" />
          ) : (
            <span className="flex size-full items-center justify-center text-7xl font-bold text-[var(--ct-acento)]/40">{tarjeta.nombre.slice(0, 1)}</span>
          )}
        </div>
        {fotos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pt-3 md:px-0">
            {fotos.map((f) => (
              <button
                key={f.foto}
                type="button"
                onClick={() => {
                  setFotoElegida(f.foto);
                  if (f.color) setColor(f.color);
                }}
                aria-label={f.color ? `Ver en ${f.color}` : "Ver foto"}
                className={`size-16 shrink-0 overflow-hidden rounded-xl ring-2 ${foto === f.foto ? "ring-[var(--ct-noche)]" : "ring-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura */}
                <img src={`/c/${slug}/foto/${f.foto}`} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative -mt-5 space-y-4 rounded-t-3xl bg-[var(--ct-fondo)] px-5 pt-5 md:mt-0 md:rounded-none md:px-0 md:pt-0">
        <div className="space-y-2">{cabecera}</div>

        {tallas.length > 0 && (
          <div>
            <p className={`pb-2 text-sm font-bold ${falta && !talla ? "text-[#c62f3f]" : ""}`}>
              {falta && !talla ? "👇 Escoge tu talla" : "Talla"}
            </p>
            <div className="flex flex-wrap gap-2">
              {tallas.map((t) => {
                const hay = tallaDisponible(t.talla);
                const activa = igual(talla, t.talla);
                return (
                  <button
                    key={t.talla}
                    type="button"
                    onClick={() => {
                      setTalla(t.talla);
                      setFalta(false);
                    }}
                    aria-pressed={activa}
                    className={`flex h-12 min-w-12 items-center justify-center rounded-xl px-3 text-base font-bold ring-1 ${
                      activa
                        ? "bg-[var(--ct-noche)] text-[var(--ct-acentoClaro)] ring-[var(--ct-noche)]"
                        : hay
                          ? "bg-white ring-[var(--ct-borde)]"
                          : "bg-black/[0.04] text-[var(--ct-gris)] line-through ring-transparent"
                    }`}
                  >
                    {t.talla}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {colores.length > 0 && (
          <div>
            <p className={`pb-2 text-sm font-bold ${falta && !color ? "text-[#c62f3f]" : ""}`}>
              Color{color ? <span className="font-normal">: {color}</span> : null}
            </p>
            <div className="flex flex-wrap gap-3">
              {colores.map((c) => {
                const hex = colorMuestra(c.color);
                const activo = igual(color, c.color);
                const hay = colorDisponible(c.color);
                return (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => {
                      setColor(c.color);
                      setFotoElegida(null);
                      setFalta(false);
                    }}
                    aria-pressed={activo}
                    aria-label={c.color}
                    title={c.color}
                    className={`relative flex items-center gap-2 rounded-full ${hex ? "size-11 justify-center" : "h-11 px-4 text-sm font-semibold ring-1 ring-[var(--ct-borde)]"} ${
                      activo ? "outline-2 outline-offset-2 outline-[var(--ct-noche)]" : ""
                    } ${hay ? "" : "opacity-40"}`}
                    style={hex ? { background: hex, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.15)" } : undefined}
                  >
                    {hex ? null : c.color}
                    {!hay && hex && <span className="absolute h-0.5 w-12 rotate-45 bg-[#c62f3f]" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {completa && !agotada && variante && (
          <p className="text-sm font-semibold text-emerald-700">
            ● {mostrarCantidad && variante.stock < 99 ? `Disponible: ${variante.stock === 1 ? "queda 1" : `quedan ${variante.stock}`}` : "Disponible"}
            {variante.talla ? ` en talla ${variante.talla}` : ""}
            {variante.color ? ` ${variante.color.toLowerCase()}` : ""}
          </p>
        )}

        {agotada ? (
          <AvisoTalla slug={slug} clave={tarjeta.clave} talla={talla} color={color} />
        ) : (
          <div className="space-y-2 pt-1">
            {hayWhatsapp && (
              <button
                type="button"
                onClick={() => exigir() && pedir([linea()], [tarjeta.clave])}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-lg font-bold text-white shadow-lg shadow-[#25d366]/30"
              >
                <IconoWhatsapp className="size-6" /> Pedir por WhatsApp
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!exigir() || !variante) return;
                agregar({
                  productoId: variante.id,
                  clave: tarjeta.clave,
                  nombre: tarjeta.nombre,
                  talla: variante.talla,
                  color: variante.color,
                  precio,
                  foto: foto ? `/c/${slug}/foto/${foto}` : null,
                  link: linkPrenda,
                });
                setAgregada(true);
              }}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold ring-2 ring-[var(--ct-noche)]"
            >
              {agregada ? <Check className="size-5 text-emerald-600" /> : <ShoppingBag className="size-5" />}
              {agregada ? "Agregada a la bolsa" : "Agregar a la bolsa"}
            </button>
            {agregada && (
              <button type="button" onClick={abrir} className="w-full py-1 text-center text-sm font-semibold text-[var(--ct-acento)] underline">
                Ver mi bolsa y enviar el pedido
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AvisoTalla({ slug, clave, talla, color }: { slug: string; clave: string; talla: string | null; color: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [estado, setEstado] = useState<{ ok?: boolean; error?: string; enviando?: boolean }>({});
  const que = [talla ? `talla ${talla}` : null, color?.toLowerCase()].filter(Boolean).join(" ");

  if (estado.ok) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
        <p className="font-bold">¡Listo! Te avisamos por WhatsApp 🎉</p>
        <p className="text-sm">Apenas llegue {que ? `la ${que}` : "esta prenda"}, la tienda te escribe.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-[var(--ct-borde)]">
      <p className="font-semibold">😢 Se agotó {que ? `la ${que}` : "esta opción"}</p>
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ct-noche)] text-base font-bold text-[var(--ct-acentoClaro)]"
        >
          <BellRing className="size-5" /> Avísame cuando llegue
        </button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setEstado({ enviando: true });
            try {
              const r = await fetch(`/c/${slug}/aviso`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clave, talla, color, cliente, telefono }),
              });
              const j = (await r.json()) as { ok: boolean; error?: string };
              setEstado(j.ok ? { ok: true } : { error: j.error ?? "No se pudo guardar. Intenta otra vez." });
            } catch {
              setEstado({ error: "No hay conexión. Intenta otra vez." });
            }
          }}
          className="space-y-3"
        >
          <label className="block space-y-1">
            <span className="text-sm font-semibold">Tu nombre</span>
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              maxLength={60}
              autoComplete="given-name"
              className="h-12 w-full rounded-xl bg-[var(--ct-fondo)] px-4 text-base ring-1 ring-[var(--ct-borde)] outline-none focus:ring-2 focus:ring-[var(--ct-acento)]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">Tu WhatsApp</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              maxLength={20}
              className="h-12 w-full rounded-xl bg-[var(--ct-fondo)] px-4 text-base ring-1 ring-[var(--ct-borde)] outline-none focus:ring-2 focus:ring-[var(--ct-acento)]"
            />
          </label>
          {estado.error && <p className="text-sm font-semibold text-[#c62f3f]">{estado.error}</p>}
          <button
            type="submit"
            disabled={estado.enviando}
            className="h-14 w-full rounded-2xl bg-[var(--ct-noche)] text-base font-bold text-[var(--ct-acentoClaro)] disabled:opacity-60"
          >
            {estado.enviando ? "Guardando…" : "Avisarme por WhatsApp"}
          </button>
          <p className="text-center text-xs text-[var(--ct-gris)]">Solo usamos tu número para avisarte de esta prenda.</p>
        </form>
      )}
    </div>
  );
}
