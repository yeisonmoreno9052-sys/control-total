import type { MetadataRoute } from "next";

// Lo que hace que Control Total se pueda instalar como aplicación (ícono en el
// escritorio o en la pantalla de inicio, sin barra del navegador).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Control Total",
    short_name: "Control Total",
    description: "Ventas, inventario y caja de tu negocio. Desarrollado por EMY TELECOM.",
    lang: "es-CO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111633",
    theme_color: "#111633",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
