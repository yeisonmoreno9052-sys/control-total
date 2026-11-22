import type { Metadata } from "next";
import { Eye, MessageCircle } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { avisosPendientes, estadisticasCatalogo, obtenerConfigCatalogo, type FilaEstadistica } from "@/lib/datos/catalogo";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { qrSvg } from "@/lib/etiquetas/qr";
import { puedeGestionar } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";
import { urlPublica } from "@/lib/url-publica";
import { PestanasConfiguracion } from "../pestanas";
import { ListaAvisos } from "./avisos";
import { FormularioCatalogo, LinkCatalogo, TextosWhatsapp } from "./formulario";

export const metadata: Metadata = { title: "Catálogo en línea · Control Total" };

function Lista({ titulo, icono, filas, campo, vacio }: { titulo: string; icono: React.ReactNode; filas: FilaEstadistica[]; campo: "vistas" | "pedidos"; vacio: string }) {
  const max = Math.max(1, ...filas.map((f) => f[campo]));
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold">
        {icono} {titulo}
      </h3>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ol className="space-y-2">
          {filas.map((f, i) => (
            <li key={f.clave} className="space-y-1">
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate">
                  {i + 1}. {f.nombre}
                </span>
                <span className="shrink-0 font-semibold">{f[campo]}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(f[campo] / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function PaginaCatalogo() {
  const ctx = await obtenerContexto();
  if (!puedeGestionar(ctx)) return <SinPermiso />;
  const negocioId = ctx.negocioActivoId;
  const [config, base, empresa] = await Promise.all([negocioId ? obtenerConfigCatalogo(ctx, negocioId) : null, urlPublica(), obtenerEmpresa(ctx)]);
  const encendido = !!config?.activo;
  const [stats, avisos] = negocioId && encendido ? await Promise.all([estadisticasCatalogo(ctx, negocioId), avisosPendientes(ctx, negocioId)]) : [null, []];
  const link = config ? `${base}/c/${config.slug}` : "";
  const qr = encendido ? qrSvg(link) : null;

  return (
    <div className="space-y-8">
      <div>
        <EncabezadoPagina titulo="Configuración" />
        <PestanasConfiguracion activa="/configuracion/catalogo" rol={ctx.rol} />
      </div>
      {!config ? (
        <p className="text-muted-foreground">No tienes un negocio asignado.</p>
      ) : (
        <>
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-suave md:p-6">
            <div>
              <h2 className="text-lg font-semibold">Catálogo en línea de {config.nombreNegocio}</h2>
              <p className="text-sm text-muted-foreground">
                Una página con las fotos, precios, tallas y colores de lo que hay en inventario. Se actualiza sola: lo que se agota
                desaparece. Los clientes piden por WhatsApp. Nunca muestra costos ni ventas.
              </p>
            </div>
            <FormularioCatalogo key={`${config.slug}-${config.activo}`} config={config} base={base} />
          </section>

          {encendido && (
            <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-suave md:p-6">
              <div>
                <h2 className="text-lg font-semibold">Compártelo</h2>
                <p className="text-sm text-muted-foreground">
                  Mándalo cuando te pidan el catálogo, ponlo en el perfil de WhatsApp e Instagram e imprime el QR para la vitrina.
                </p>
              </div>
              <LinkCatalogo link={link} qr={qr} negocio={config.nombreNegocio} logoUrl={empresa?.logoUrl ?? null} />
            </section>
          )}

          {encendido && (
            <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-suave md:p-6">
              <div>
                <h2 className="text-lg font-semibold">Clientes esperando su talla</h2>
                <p className="text-sm text-muted-foreground">
                  Dejaron su WhatsApp en el catálogo porque la talla o el color estaba agotado. Cuando llegue, escríbeles con un toque.
                </p>
              </div>
              <ListaAvisos avisos={avisos} negocio={config.nombreNegocio} base={`${base}/c/${config.slug}`} />
            </section>
          )}

          {stats && (
            <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-suave md:p-6">
              <div>
                <h2 className="text-lg font-semibold">Qué miran y qué piden</h2>
                <p className="text-sm text-muted-foreground">
                  Últimos {stats.dias} días. Sirve para saber qué volver a comprar y qué prenda anunciar.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted p-4">
                  <p className="text-sm text-muted-foreground">Prendas vistas</p>
                  <p className="text-3xl font-bold">{stats.vistas.toLocaleString("es-CO")}</p>
                </div>
                <div className="rounded-xl bg-muted p-4">
                  <p className="text-sm text-muted-foreground">Pedidos por WhatsApp</p>
                  <p className="text-3xl font-bold">{stats.pedidos.toLocaleString("es-CO")}</p>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <Lista titulo="Las más vistas" icono={<Eye className="size-4" />} filas={stats.masVistas} campo="vistas" vacio="Todavía nadie ha abierto una prenda. Comparte el link." />
                <Lista titulo="Las más pedidas" icono={<MessageCircle className="size-4" />} filas={stats.masPedidas} campo="pedidos" vacio="Todavía no hay pedidos desde el catálogo." />
              </div>
            </section>
          )}

          {encendido && (
            <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-suave md:p-6">
              <div>
                <h2 className="text-lg font-semibold">Respuestas automáticas de WhatsApp Business</h2>
                <p className="text-sm text-muted-foreground">
                  Textos listos con el link del catálogo. Cópialos en WhatsApp Business: Herramientas para la empresa → Mensaje de
                  bienvenida, Mensaje de ausencia y Respuestas rápidas.
                </p>
              </div>
              <TextosWhatsapp link={link} negocio={config.nombreNegocio} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
