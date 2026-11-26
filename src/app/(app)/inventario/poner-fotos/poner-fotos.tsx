"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, CircleAlert, CircleCheck, Images, LoaderCircle, PartyPopper, SearchX } from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Button } from "@/components/ui/button";
import { achicarFoto } from "@/lib/achicar-foto";
import { cn } from "@/lib/utils";
import { guardarFotoAccion } from "../acciones";

type Producto = {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string | null;
  fotoUrl: string | null;
  /** Tallas de la misma prenda y color comparten grupo: una foto queda en todas. null = producto suelto. */
  grupo: string | null;
};
/** copia: la foto se tomó en otra talla del mismo color y quedó también en esta. */
type Estado = { paso: "guardando" | "listo" | "error"; vista: string; error?: string; copia?: boolean };

/**
 * Lista para recorrer el local con la tablet: tocar la cámara, tomar la foto y seguir.
 * Cada foto se guarda sola en su producto; mientras sube ya se puede tomar la siguiente.
 * La lista no se mueve al guardar (aunque el producto ya tenga foto) para no perder el puesto.
 */
export function PonerFotos({
  modo,
  productos,
  hayFiltros,
  siguiente,
  quitarFiltros,
  verConFoto,
}: {
  modo: "sin" | "con";
  productos: Producto[];
  hayFiltros: boolean;
  siguiente: string | null;
  quitarFiltros: string;
  verConFoto: string;
}) {
  // Se queda con la lista de cuando abrió la página: al guardar, el servidor ya no la
  // mandaría en "Sin foto" y la fila desaparecería bajo el dedo.
  const [lista] = useState(productos);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  // El primero que falta queda señalado como "el que sigue".
  const [turno, setTurno] = useState<string | null>(modo === "sin" ? (productos[0]?.id ?? null) : null);
  const objetivo = useRef<string | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const filas = useRef(new Map<string, HTMLLIElement>());

  const cambiar = (id: string, e: Estado) => setEstados((antes) => ({ ...antes, [id]: e }));
  const quitarEstado = (id: string) =>
    setEstados((antes) => {
      const resto = { ...antes };
      delete resto[id];
      return resto;
    });
  const tieneFoto = (p: Producto) => !!p.fotoUrl || estados[p.id]?.paso === "listo" || estados[p.id]?.paso === "guardando";

  function abrir(id: string, desde: "camara" | "galeria") {
    objetivo.current = id;
    setTurno(id);
    (desde === "camara" ? camara : galeria).current?.click();
  }

  /** Las otras tallas del mismo color que están en esta lista. */
  const hermanas = (id: string) => {
    const grupo = lista.find((p) => p.id === id)?.grupo;
    return grupo ? lista.filter((p) => p.grupo === grupo && p.id !== id) : [];
  };

  /** Señala el siguiente sin foto y lo deja a la vista, para tocar su cámara de una vez. */
  function pasarAlSiguiente(id: string) {
    const i = lista.findIndex((p) => p.id === id);
    // Las otras tallas del mismo color reciben esta foto: se saltan.
    const saltar = new Set(hermanas(id).map((p) => p.id));
    const proximo =
      lista.slice(i + 1).find((p) => !p.fotoUrl && !estados[p.id] && !saltar.has(p.id)) ??
      (modo === "con" ? lista.slice(i + 1).find((p) => !saltar.has(p.id)) : undefined);
    setTurno(proximo?.id ?? null);
    if (proximo) {
      // Espera a que el navegador vuelva de la cámara antes de mover la pantalla.
      setTimeout(() => filas.current.get(proximo.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  }

  async function elegido(archivo: File | undefined) {
    const id = objetivo.current;
    if (camara.current) camara.current.value = "";
    if (galeria.current) galeria.current.value = "";
    if (!archivo || !id) return;

    let blob: Blob;
    try {
      blob = await achicarFoto(archivo);
    } catch {
      cambiar(id, { paso: "error", vista: "", error: "No pudimos abrir esa imagen. Prueba otra vez." });
      return;
    }
    const vista = URL.createObjectURL(blob);
    const otras = hermanas(id);
    cambiar(id, { paso: "guardando", vista });
    for (const h of otras) cambiar(h.id, { paso: "guardando", vista, copia: true });
    pasarAlSiguiente(id);

    const formulario = new FormData();
    formulario.set("foto", new File([blob], "foto", { type: blob.type }));
    try {
      const r = await guardarFotoAccion(id, formulario);
      cambiar(id, r.error ? { paso: "error", vista, error: r.error } : { paso: "listo", vista });
      // Las que el servidor también cambió quedan listas; si falló, vuelven como estaban.
      const hechas = new Set(r.ids ?? []);
      for (const h of otras) {
        if (hechas.has(h.id)) cambiar(h.id, { paso: "listo", vista, copia: true });
        else quitarEstado(h.id);
      }
    } catch {
      cambiar(id, { paso: "error", vista, error: "No se pudo guardar. Revisa el internet y toca la cámara otra vez." });
      for (const h of otras) quitarEstado(h.id);
    }
  }

  const propias = Object.values(estados).filter((e) => !e.copia);
  const guardadas = propias.filter((e) => e.paso === "listo").length;
  const subiendo = propias.filter((e) => e.paso === "guardando").length;
  const copiadas = Object.values(estados).filter((e) => e.copia && e.paso === "listo").length;
  const pendientes = modo === "sin" ? lista.filter((p) => !tieneFoto(p)).length : 0;

  if (lista.length === 0) {
    if (hayFiltros) {
      return (
        <EstadoVacio
          icono={SearchX}
          titulo={modo === "sin" ? "No hay productos sin foto con esa búsqueda" : "No encontramos productos"}
          descripcion="Prueba con otra palabra o quita los filtros."
          accion={
            <Button asChild variant="outline">
              <Link href={quitarFiltros}>Quitar filtros</Link>
            </Button>
          }
        />
      );
    }
    return modo === "sin" ? (
      <EstadoVacio
        icono={PartyPopper}
        titulo="¡Todos los productos tienen foto!"
        descripcion="Si quieres cambiar alguna, búscala en Con foto."
        accion={
          <Button asChild variant="outline">
            <Link href={verConFoto}>Ver los que tienen foto</Link>
          </Button>
        }
      />
    ) : (
      <EstadoVacio icono={Camera} titulo="Todavía ningún producto tiene foto" descripcion="Empieza por la pestaña Sin foto." />
    );
  }

  return (
    <div className="space-y-4">
      {/* Un solo par de entradas para toda la lista: "capture" abre la cámara directo en tablet y celular. */}
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(ev) => elegido(ev.target.files?.[0])}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(ev) => elegido(ev.target.files?.[0])}
      />

      {(guardadas > 0 || subiendo > 0) && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-emerald-900 shadow-suave dark:bg-emerald-950 dark:text-emerald-100"
        >
          {subiendo > 0 ? <LoaderCircle className="size-5 animate-spin" /> : <CircleCheck className="size-5" />}
          <span className="font-medium">
            {guardadas === 1 ? "1 foto guardada" : `${guardadas} fotos guardadas`}
            {copiadas > 0 && ` · ${copiadas === 1 ? "1 talla más" : `${copiadas} tallas más`} con la misma foto`}
            {subiendo > 0 && ` · guardando ${subiendo}…`}
          </span>
        </div>
      )}

      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-suave">
        {lista.map((p) => {
          const estado = estados[p.id];
          const foto = estado?.vista || p.fotoUrl;
          const esTurno = turno === p.id && estado?.paso !== "guardando" && estado?.paso !== "listo";
          return (
            <li
              key={p.id}
              ref={(el) => {
                if (el) filas.current.set(p.id, el);
                else filas.current.delete(p.id);
              }}
              className={cn(
                "flex items-center gap-3 p-3 transition-colors md:gap-4 md:p-4",
                esTurno && "bg-primary/5 ring-2 ring-primary ring-inset",
                estado?.paso === "listo" && "bg-emerald-50/60 dark:bg-emerald-950/30",
              )}
            >
              <button
                type="button"
                onClick={() => abrir(p.id, "camara")}
                aria-label={`Tomar foto de ${p.nombre}`}
                className={cn(
                  "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted md:size-24",
                  !foto && "border-2 border-dashed border-muted-foreground/30",
                )}
              >
                {foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={foto} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <Camera className="size-8 text-muted-foreground/60" />
                )}
                {estado?.paso === "guardando" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <LoaderCircle className="size-7 animate-spin text-white" />
                  </span>
                )}
                {estado?.paso === "listo" && (
                  <span className="absolute right-1 bottom-1 rounded-full bg-emerald-600 p-0.5 text-white">
                    <CircleCheck className="size-5" />
                  </span>
                )}
              </button>

              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="line-clamp-2 text-base leading-snug font-medium">{p.nombre}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {p.codigo}
                  {p.categoria ? ` · ${p.categoria}` : ""}
                </p>
                {estado?.paso === "guardando" && <p className="text-sm text-muted-foreground">Guardando…</p>}
                {estado?.paso === "listo" && (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {estado.copia ? "Misma foto de la otra talla" : "Foto guardada"}
                  </p>
                )}
                {estado?.paso === "error" && (
                  <p role="alert" className="flex items-start gap-1 text-sm text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> {estado.error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  size="lg"
                  className="h-14 px-4 text-base sm:px-5"
                  variant={esTurno || (!foto && modo === "sin") ? "default" : "outline"}
                  onClick={() => abrir(p.id, "camara")}
                >
                  <Camera className="size-6" />
                  <span className="hidden sm:inline">{foto ? "Cambiar" : "Tomar foto"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 sm:h-14 sm:w-14"
                  aria-label={`Elegir de la galería una foto de ${p.nombre}`}
                  onClick={() => abrir(p.id, "galeria")}
                >
                  <Images className="size-5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {modo === "sin" && pendientes === 0 && !siguiente && (
        <p className="flex items-center justify-center gap-2 py-2 text-center font-medium text-emerald-700 dark:text-emerald-400">
          <PartyPopper className="size-5" /> ¡Listo! Ya les pusiste foto a todos los de esta lista.
        </p>
      )}

      {siguiente && (
        <div className="flex justify-center">
          <Button asChild size="lg" variant={modo === "sin" && pendientes === 0 ? "default" : "outline"}>
            <Link href={siguiente}>{modo === "sin" ? "Seguir con los que faltan" : "Ver más productos"}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
