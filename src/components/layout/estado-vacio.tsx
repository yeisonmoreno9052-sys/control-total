import type { LucideIcon } from "lucide-react";

/** Pantalla vacía con una frase y una acción, nunca una pantalla en blanco. */
export function EstadoVacio({
  icono: Icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icono className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold">{titulo}</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {accion}
    </div>
  );
}
