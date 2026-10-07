import { formatearPesos } from "@/lib/formato";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiqueta = (dia: string) => `${Number(dia.slice(8))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;

/** Barras de ventas por día. Dibujada a mano (SVG), con el color de la marca, sin librerías. */
export function GraficaBarras({ datos, alto = 180 }: { datos: { dia: string; total: number }[]; alto?: number }) {
  if (!datos.length) return null;
  const maximo = Math.max(...datos.map((d) => d.total), 1);
  const ancho = 100 / datos.length;
  // Etiquetas de fecha: unas 6 repartidas, para que no se amontonen.
  const cada = Math.max(1, Math.ceil(datos.length / 6));
  const total = datos.reduce((a, d) => a + d.total, 0);
  return (
    <figure className="space-y-2">
      <figcaption className="sr-only">
        Ventas por día: {datos.length} días, total {formatearPesos(total)}.
      </figcaption>
      <svg viewBox={`0 0 100 ${alto}`} preserveAspectRatio="none" className="h-44 w-full" role="img" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((y) => (
          <line
            key={y}
            x1="0"
            x2="100"
            y1={alto * y}
            y2={alto * y}
            className="stroke-border"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {datos.map((d, i) => {
          const h = (d.total / maximo) * (alto - 4);
          return (
            <rect
              key={d.dia}
              x={i * ancho + ancho * 0.15}
              y={alto - h}
              width={ancho * 0.7}
              height={Math.max(h, d.total ? 1 : 0)}
              rx="0.6"
              className="fill-primary"
            >
              <title>{`${etiqueta(d.dia)}: ${formatearPesos(d.total)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex text-[11px] text-muted-foreground">
        {datos.map((d, i) => (
          <span key={d.dia} className="flex-1 text-center whitespace-nowrap" style={{ minWidth: 0 }}>
            {i % cada === 0 ? etiqueta(d.dia) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}
