"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Images, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { achicarFoto } from "@/lib/achicar-foto";
import { guardarFotoPorArchivoAccion } from "../acciones";

type Fila = { archivo: string; estado: "esperando" | "subiendo" | "listo" | "error"; texto?: string };

export function SubirFotos() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [trabajando, setTrabajando] = useState(false);

  const cambiar = (i: number, f: Partial<Fila>) => setFilas((antes) => antes.map((x, j) => (j === i ? { ...x, ...f } : x)));

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    const archivos = Array.from(lista);
    setFilas(archivos.map((a) => ({ archivo: a.name, estado: "esperando" })));
    setTrabajando(true);
    // Una por una: en la tablet es más seguro que mandarlas todas juntas.
    for (const [i, archivo] of archivos.entries()) {
      cambiar(i, { estado: "subiendo" });
      try {
        const blob = await achicarFoto(archivo);
        const formulario = new FormData();
        formulario.set("foto", new File([blob], "foto", { type: blob.type }));
        formulario.set("nombre", archivo.name);
        const r = await guardarFotoPorArchivoAccion(formulario);
        cambiar(i, r.error ? { estado: "error", texto: r.error } : { estado: "listo", texto: r.producto });
      } catch {
        cambiar(i, { estado: "error", texto: "No pudimos abrir esta imagen." });
      }
    }
    setTrabajando(false);
    if (entrada.current) entrada.current.value = "";
    router.refresh();
  }

  const listas = filas.filter((f) => f.estado === "listo").length;
  const conError = filas.filter((f) => f.estado === "error").length;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-suave md:p-6">
        <div className="space-y-2 text-muted-foreground">
          <p>
            Elige varias fotos a la vez. Cada foto se pone en el producto que diga su <strong>nombre de archivo</strong>:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Con el código al inicio: <span className="font-medium text-foreground">C001 Tinto.jpg</span>
            </li>
            <li>
              O con el nombre exacto del producto: <span className="font-medium text-foreground">Empanada.jpg</span>
            </li>
          </ul>
          <p>Si el producto ya tenía foto, se cambia por la nueva.</p>
        </div>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Elegir fotos"
          onChange={(ev) => subir(ev.target.files)}
        />
        <Button type="button" size="lg" className="h-14 w-full text-base md:w-auto" onClick={() => entrada.current?.click()} disabled={trabajando}>
          {trabajando ? <LoaderCircle className="animate-spin" /> : <Images />}
          {trabajando ? `Subiendo ${listas + conError + 1} de ${filas.length}…` : "Elegir fotos"}
        </Button>
      </section>

      {filas.length > 0 && (
        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-suave md:p-6">
          <p role="status" className="font-semibold">
            {trabajando
              ? "Subiendo fotos…"
              : `${listas} ${listas === 1 ? "foto puesta" : "fotos puestas"}${conError ? ` · ${conError} sin producto` : ""}`}
          </p>
          <ul className="divide-y">
            {filas.map((f, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                {f.estado === "listo" ? (
                  <CircleCheck className="size-5 shrink-0 text-emerald-600" />
                ) : f.estado === "error" ? (
                  <CircleAlert className="size-5 shrink-0 text-destructive" />
                ) : (
                  <LoaderCircle className={f.estado === "subiendo" ? "size-5 shrink-0 animate-spin text-muted-foreground" : "size-5 shrink-0 text-muted-foreground/40"} />
                )}
                <div className="min-w-0">
                  <p className="truncate">{f.archivo}</p>
                  {f.texto && (
                    <p className={f.estado === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                      {f.estado === "listo" ? `Puesta en ${f.texto}` : f.texto}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
