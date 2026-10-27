"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Foto pequeña de un producto en listas. Si no carga (sin internet), no ocupa espacio. */
export function Miniatura({ src, className }: { src: string | null | undefined; className?: string }) {
  const [falla, setFalla] = useState(false);
  if (!src || falla) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFalla(true)}
      className={cn("size-11 shrink-0 rounded-lg border bg-muted object-cover", className)}
    />
  );
}
