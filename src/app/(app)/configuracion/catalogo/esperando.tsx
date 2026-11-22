import { BellRing } from "lucide-react";
import { avisosPendientes, slugCatalogo } from "@/lib/datos/catalogo";
import type { Contexto } from "@/lib/datos/contexto";
import { obtenerNegocio } from "@/lib/datos/negocios";
import { urlPublica } from "@/lib/url-publica";
import { ListaAvisos } from "./avisos";

/** "Clientes esperando esta prenda" (catálogo en línea). No muestra nada si nadie espera. */
export async function ClientesEsperando({ ctx, negocioId, prendaId }: { ctx: Contexto; negocioId: string; prendaId: string }) {
  const slug = await slugCatalogo(ctx, negocioId);
  if (!slug) return null;
  const avisos = await avisosPendientes(ctx, negocioId, prendaId);
  if (!avisos.length) return null;
  const negocio = (await obtenerNegocio(ctx, negocioId))?.nombre ?? "la tienda";
  const listos = avisos.filter((a) => a.llego).length;
  return (
    <section className="space-y-3 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4 shadow-suave md:p-5 dark:bg-emerald-950/30">
      <h2 className="flex items-center gap-2 font-semibold">
        <BellRing className="size-5 text-emerald-700" />
        {avisos.length === 1 ? "1 cliente espera esta prenda" : `${avisos.length} clientes esperan esta prenda`}
        {listos > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{listos} ya se pueden avisar</span>}
      </h2>
      <p className="text-sm text-muted-foreground">Lo pidieron desde el catálogo en línea. Toca &quot;Escribirle&quot; y WhatsApp se abre con el mensaje listo.</p>
      <ListaAvisos avisos={avisos} negocio={negocio} base={`${await urlPublica()}/c/${slug}`} compacta />
    </section>
  );
}
