"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const miles = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Campo de dinero: solo acepta dígitos y los muestra con puntos de miles mientras se escribe. */
export function CampoPesos({
  valor,
  onValor,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  valor: number | null;
  onValor: (valor: number | null) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={valor === null ? "" : miles.format(valor)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, "").slice(0, 12);
          onValor(digitos ? Number(digitos) : null);
        }}
        className={cn("pl-7 tabular-nums", className)}
      />
    </div>
  );
}
