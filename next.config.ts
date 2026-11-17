import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app instalada (PWA) abre en "/". Ese salto a /panel se hace aquí y no en
  // la página: con cacheComponents, cuando "/" se regeneraba en caché, Next
  // devolvía el encabezado de redirección repetido ("/panel, /panel") y el
  // celular mostraba "404 This page could not be found".
  async redirects() {
    return [{ source: "/", destination: "/panel", permanent: false }];
  },
  cacheComponents: true,
  experimental: {
    // La importación de inventario sube archivos de Excel de hasta 15 MB.
    serverActions: { bodySizeLimit: "16mb" },
    proxyClientMaxBodySize: "16mb",
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
