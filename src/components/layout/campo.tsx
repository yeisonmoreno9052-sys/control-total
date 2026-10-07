import { Label } from "@/components/ui/label";

/** Etiqueta + control + ayuda o error, siempre con el mismo espaciado. */
export function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  children,
  className,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="space-y-2">
        <Label htmlFor={id}>{etiqueta}</Label>
        {children}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <div className="mt-1.5 text-sm text-muted-foreground">{ayuda}</div>
      ) : null}
    </div>
  );
}

/** Mensaje de error general de un formulario. */
export function AvisoError({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {mensaje}
    </p>
  );
}
