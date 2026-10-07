// Service worker de Control Total: guarda la caja para que abra aunque no haya internet.
// - Archivos de la aplicación (/_next/static): se guardan y se sirven desde la copia.
// - Páginas: siempre del servidor; si no hay internet, se muestra la caja guardada.
const VERSION = "caja-v1";
const CAJA = "/ventas/sin-conexion";

async function guardarCaja() {
  const copia = await caches.open(VERSION);
  const respuesta = await fetch(CAJA, { credentials: "same-origin", cache: "no-store" });
  // Sin sesión el servidor manda a /ingresar: no hay nada que guardar todavía.
  if (!respuesta.ok || respuesta.redirected) return;
  const html = await respuesta.clone().text();
  await copia.put(CAJA, respuesta);
  // Los archivos que usa la página (programas y estilos), para que funcione sin red.
  const archivos = new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]));
  await Promise.all([...archivos].map((url) => copia.add(url).catch(() => undefined)));
}

self.addEventListener("install", (evento) => {
  self.skipWaiting();
  evento.waitUntil(guardarCaja().catch(() => undefined));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) if (nombre !== VERSION) await caches.delete(nombre);
      await self.clients.claim();
    })(),
  );
});

// La página pide refrescar la copia de la caja (por ejemplo, después de una actualización).
self.addEventListener("message", (evento) => {
  if (evento.data === "guardar-caja") evento.waitUntil(guardarCaja().catch(() => undefined));
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      (async () => {
        const copia = await caches.open(VERSION);
        const guardada = await copia.match(pedido);
        if (guardada) return guardada;
        const respuesta = await fetch(pedido);
        if (respuesta.ok) copia.put(pedido, respuesta.clone());
        return respuesta;
      })(),
    );
    return;
  }

  if (pedido.mode === "navigate") {
    evento.respondWith(
      (async () => {
        try {
          return await fetch(pedido);
        } catch (error) {
          const caja = await caches.match(CAJA);
          if (!caja) throw error;
          if (url.pathname === CAJA) return caja;
          return Response.redirect(CAJA, 302);
        }
      })(),
    );
  }
});
