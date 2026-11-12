"use client";

import { Dialogo } from "@/components/ui/dialogo";
import type { ProductoCaja } from "@/lib/datos/productos";
import { formatearPesos } from "@/lib/formato";
import { Decimal, formatearCantidad } from "@/lib/inventario/cantidades";
import { cn } from "@/lib/utils";

/** Al buscar una prenda por nombre: botones grandes para escoger la talla (y el color). */
export function DialogoTalla({
  abierto,
  variantes,
  onElegir,
  onCerrar,
}: {
  abierto: boolean;
  variantes: ProductoCaja[];
  onElegir: (p: ProductoCaja) => void;
  onCerrar: () => void;
}) {
  const nombre = variantes[0]?.prenda ?? variantes[0]?.nombre ?? "Escoge la talla";
  const colores = [...new Set(variantes.map((v) => v.color ?? ""))];
  const precios = new Set(variantes.map((v) => v.precioVenta));
  const unPrecio = precios.size === 1 ? variantes[0]?.precioVenta : null;
  const primera = variantes.find((v) => v.controlaStock === false || new Decimal(v.stock).gt(0))?.id;

  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={nombre} className="max-w-2xl">
      <div className="space-y-5">
        <p className="text-muted-foreground">
          ¿Qué talla{colores.some(Boolean) ? " y color" : ""} lleva?
          {unPrecio !== null && unPrecio !== undefined && <span className="font-semibold text-foreground"> {formatearPesos(unPrecio)}</span>}
        </p>
        {colores.map((color) => (
          <div key={color || "sin"} className="space-y-2">
            {color && <p className="font-semibold">{color}</p>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {variantes
                .filter((v) => (v.color ?? "") === color)
                .map((v) => {
                  const seCuenta = v.controlaStock !== false;
                  const agotada = seCuenta && new Decimal(v.stock).lte(0);
                  const enfocar = v.id === primera;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={agotada}
                      data-autofocus={enfocar ? true : undefined}
                      onClick={() => onElegir(v)}
                      className={cn(
                        "flex min-h-18 flex-col items-center justify-center rounded-xl border-2 bg-card px-2 py-2 transition",
                        agotada
                          ? "cursor-not-allowed border-dashed opacity-45"
                          : "hover:border-primary focus-visible:border-primary focus-visible:outline-none active:scale-[0.98] active:bg-accent",
                      )}
                    >
                      <span className="text-2xl leading-tight font-bold">{v.talla ?? v.nombre}</span>
                      <span className={cn("text-xs", agotada ? "text-destructive" : "text-muted-foreground")}>
                        {agotada ? "Agotada" : seCuenta ? `Quedan ${formatearCantidad(v.stock)}` : ""}
                      </span>
                      {unPrecio === null && <span className="text-xs font-medium tabular-nums">{formatearPesos(v.precioVenta)}</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </Dialogo>
  );
}
