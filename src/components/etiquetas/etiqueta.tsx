import { formatearPesos } from "@/lib/formato";
import { cn } from "@/lib/utils";

/** Tamaños de rollo: 60 × 30 mm (el de siempre) y 50 × 25 mm (el común en almacenes de ropa). */
export const TAMANOS_ETIQUETA = {
  "60x30": { nombre: "60 × 30 mm", clase: "h-[30mm] w-[60mm] px-[2.5mm] py-[2mm]", barras: "h-[9mm]" },
  "50x25": { nombre: "50 × 25 mm", clase: "h-[25mm] w-[50mm] px-[2mm] py-[1.5mm]", barras: "h-[7mm]" },
} as const;

export type TamanoEtiqueta = keyof typeof TAMANOS_ETIQUETA;

const MEDIDAS: Record<TamanoEtiqueta, string> = { "60x30": "60mm 30mm", "50x25": "50mm 25mm" };

/**
 * Para imprimir en la impresora de rollo: cada hoja es una etiqueta del tamaño del rollo,
 * sin márgenes, y cada etiqueta va en su propia hoja. Así la impresora no la encoge ni la parte.
 */
export function EstiloRollo({ tamano }: { tamano: TamanoEtiqueta }) {
  return (
    <style>{`@page { size: ${MEDIDAS[tamano]}; margin: 0; }
@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  .rollo-etiquetas { display: block !important; gap: 0 !important; margin: 0 !important; }
  .rollo-etiquetas > article { break-after: page; page-break-after: always; border: 0 !important; border-radius: 0 !important; }
  .rollo-etiquetas > article:last-child { break-after: auto; page-break-after: auto; }
}`}</style>
  );
}

export function leerTamano(valor: unknown, porDefecto: TamanoEtiqueta): TamanoEtiqueta {
  return typeof valor === "string" && valor in TAMANOS_ETIQUETA ? (valor as TamanoEtiqueta) : porDefecto;
}

/**
 * Una etiqueta adhesiva: nombre, código de barras, código y precio. Si es una prenda,
 * la talla va grande en negro (es lo que la clienta busca) y el color debajo del nombre.
 */
export function Etiqueta({
  nombre,
  talla,
  color,
  texto,
  svg,
  precio,
  tamano,
}: {
  nombre: string;
  talla?: string | null;
  color?: string | null;
  /** Lo que va en las barras (código de barras o código). */
  texto: string;
  svg: string | null;
  precio: number;
  tamano: TamanoEtiqueta;
}) {
  const t = TAMANOS_ETIQUETA[tamano];
  const chica = tamano === "50x25";
  return (
    <article
      className={cn(
        "flex break-inside-avoid flex-col justify-between overflow-hidden rounded-sm border border-dashed border-neutral-400 bg-white font-sans text-black print:border-transparent",
        t.clase,
      )}
    >
      <div className="flex items-start justify-between gap-[1.5mm]">
        <div className="min-w-0">
          <p className={cn("leading-tight font-semibold", talla ? "line-clamp-1" : "line-clamp-2", chica ? "text-[8pt]" : "text-[9pt]")}>
            {nombre}
          </p>
          {color && <p className={cn("truncate leading-tight", chica ? "text-[7pt]" : "text-[8pt]")}>{color}</p>}
        </div>
        {talla && (
          <span
            className={cn(
              "shrink-0 rounded-[1mm] bg-black px-[1.5mm] leading-snug font-bold text-white",
              chica ? "text-[9pt]" : "text-[10pt]",
            )}
          >
            {talla}
          </span>
        )}
      </div>
      {svg ? (
        <div
          className={cn("mx-auto w-full [&>svg]:h-full [&>svg]:w-full", t.barras)}
          // El SVG lo genera el servidor a partir del código; no lleva texto de la persona sin escapar.
          dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg preserveAspectRatio="none" ') }}
        />
      ) : (
        <p className="text-center text-[7pt]">Este código no se puede pasar a barras</p>
      )}
      <div className="flex items-end justify-between gap-2">
        <span className={cn("truncate font-mono", chica ? "text-[7pt]" : "text-[8pt]")}>{texto}</span>
        <span className={cn("leading-none font-bold whitespace-nowrap tabular-nums", chica ? "text-[11pt]" : "text-[13pt]")}>
          {formatearPesos(precio)}
        </span>
      </div>
    </article>
  );
}
