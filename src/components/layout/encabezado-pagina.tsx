import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function EncabezadoPagina({
  titulo,
  subtitulo,
  volver,
  acciones,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  volver?: { href: string; texto: string };
  acciones?: React.ReactNode;
}) {
  return (
    <div className="mb-6 space-y-3">
      {volver && (
        <Link
          href={volver.href}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {volver.texto}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{titulo}</h1>
          {subtitulo && <div className="text-muted-foreground">{subtitulo}</div>}
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>
    </div>
  );
}
