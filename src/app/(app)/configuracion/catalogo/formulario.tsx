"use client";

import { useActionState, useState } from "react";
import { Check, Copy, ExternalLink, Printer, Share2 } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConfigCatalogo } from "@/lib/datos/catalogo";
import { guardarCatalogoAccion, type EstadoCatalogo } from "./acciones";

function Interruptor({ name, defaultChecked, titulo, ayuda }: { name: string; defaultChecked: boolean; titulo: string; ayuda: string }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-5 accent-[var(--primary)]" />
      <span>
        <span className="font-medium">{titulo}</span>
        <span className="block text-sm text-muted-foreground">{ayuda}</span>
      </span>
    </label>
  );
}

export function FormularioCatalogo({ config, base }: { config: ConfigCatalogo; base: string }) {
  const [estado, accion, guardando] = useActionState<EstadoCatalogo, FormData>(guardarCatalogoAccion, {});
  const e = estado.campos ?? {};
  const dominio = base.replace(/^https?:\/\//, "");
  return (
    <form action={accion} className="space-y-4">
      <Interruptor
        name="activo"
        defaultChecked={config.activo}
        titulo="Tener catálogo en línea"
        ayuda="Si lo apagas, el link deja de funcionar enseguida."
      />
      <Campo id="slug" etiqueta="Link del catálogo" error={e.slug} ayuda="Solo letras sin tildes, números y guiones. Corto y fácil de dictar.">
        <div className="flex items-center overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
          <span className="shrink-0 bg-muted px-3 py-2 text-sm text-muted-foreground">{dominio}/c/</span>
          <input
            id="slug"
            name="slug"
            defaultValue={config.slug}
            maxLength={40}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-10 min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
          />
        </div>
      </Campo>
      <Campo
        id="whatsapp"
        etiqueta="WhatsApp que recibe los pedidos"
        error={e.whatsapp}
        ayuda={config.telefonoNegocio ? `Si lo dejas vacío se usa el teléfono del negocio (${config.telefonoNegocio}).` : "El celular de la tienda, por ejemplo 300 123 4567."}
        className="max-w-sm"
      >
        <Input id="whatsapp" name="whatsapp" defaultValue={config.whatsapp} inputMode="tel" maxLength={30} placeholder="300 123 4567" />
      </Campo>
      <Interruptor
        name="mostrarCantidad"
        defaultChecked={config.mostrarCantidad}
        titulo='Mostrar cuántas quedan ("quedan 3")'
        ayuda='Si está apagado, el cliente solo ve "Disponible". Mostrarlo apura la compra cuando quedan pocas.'
      />
      <Interruptor
        name="marcaAgua"
        defaultChecked={config.marcaAgua}
        titulo="Poner mi logo sobre las fotos"
        ayuda="Un logo pequeño en la esquina de cada foto. Si otra tienda copia la foto con un pantallazo, se sabe que es tuya."
      />
      <AvisoError mensaje={estado.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        {estado.ok && (
          <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Guardado
          </span>
        )}
      </div>
    </form>
  );
}

function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000);
    } catch {
      window.prompt("Copia el texto:", texto);
    }
  };
  return { copiado, copiar };
}

export function LinkCatalogo({ link, qr, negocio, logoUrl }: { link: string; qr: string | null; negocio: string; logoUrl: string | null }) {
  const { copiado, copiar } = useCopiar();
  const mensaje = `¡Hola! Este es el catálogo de ${negocio} 🛍️ Mira todas las prendas con tallas y precios, y pide por WhatsApp: ${link}`;
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-start">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2 rounded-xl border bg-muted/50 p-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{link}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => copiar("link", link)}>
            {copiado === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado === "link" ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={link} target="_blank" rel="noopener">
              <ExternalLink className="size-4" /> Abrir catálogo
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener">
              <Share2 className="size-4" /> Enviar por WhatsApp
            </a>
          </Button>
          <Button type="button" variant="outline" onClick={() => copiar("mensaje", mensaje)}>
            {copiado === "mensaje" ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado === "mensaje" ? "Copiado" : "Copiar mensaje"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Truco: en WhatsApp Business, ve a Ajustes → Herramientas para la empresa → Perfil de empresa → Sitio web y pega el link.
        </p>
      </div>
      {qr && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 text-black">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo de la empresa
            <img src={logoUrl} alt="" className="size-10 rounded-full bg-black object-contain" />
          )}
          <div className="size-40 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-xs font-semibold">Escanéame y mira el catálogo</p>
          <Button asChild size="sm" className="w-full">
            <a href="/cartel-catalogo" target="_blank" rel="noopener">
              <Printer className="size-4" /> Imprimir cartel
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

export function TextosWhatsapp({ link, negocio }: { link: string; negocio: string }) {
  const { copiado, copiar } = useCopiar();
  const textos = [
    {
      id: "bienvenida",
      titulo: "Mensaje de bienvenida",
      donde: "Le llega a quien escribe por primera vez (o después de 14 días).",
      texto: `¡Bienvenid@ a ${negocio}! 🖤✨\nMira todas nuestras prendas con tallas y precios aquí 👉 ${link}\n¿Qué estás buscando hoy?`,
    },
    {
      id: "ausencia",
      titulo: "Mensaje de ausencia",
      donde: 'Escoge "Fuera del horario comercial". Responde solo a cualquier hora.',
      texto: `¡Hola! Gracias por escribirle a ${negocio} 🖤\nEn este momento estamos cerrados, pero aquí puedes ver todas las prendas, tallas y precios al instante 👉 ${link}\nEscoge tu prenda y toca "Pedir por WhatsApp". Te respondemos a primera hora 💛`,
    },
    { id: "r-catalogo", titulo: "Respuesta rápida /catalogo", donde: "Atajo: catalogo", texto: `Aquí ves todas nuestras prendas con tallas y precios 👉 ${link}` },
    {
      id: "r-tallas",
      titulo: "Respuesta rápida /tallas",
      donde: "Atajo: tallas",
      texto: `En el catálogo ves las tallas que hay de cada prenda 👉 ${link}\nSi la tuya está agotada, toca "Avísame cuando llegue" y te escribimos apenas llegue.`,
    },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {textos.map((t) => (
        <div key={t.id} className="space-y-2 rounded-xl border p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{t.titulo}</p>
              <p className="text-xs text-muted-foreground">{t.donde}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => copiar(t.id, t.texto)}>
              {copiado === t.id ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiado === t.id ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="rounded-lg bg-[#d9fdd3] p-3 text-sm whitespace-pre-line text-black">{t.texto}</p>
        </div>
      ))}
    </div>
  );
}
