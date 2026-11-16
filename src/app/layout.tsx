import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { CapturaInstalacion } from "@/components/cuenta/instalar-app";
import { SCRIPT_TEMA } from "@/components/layout/boton-tema";
import "./globals.css";

const letra = Plus_Jakarta_Sans({ variable: "--font-marca", subsets: ["latin"] });

// Pantalla de carga del iPhone (al abrir la app instalada). iOS pide una imagen por
// tamaño de pantalla; sin ella muestra una pantalla blanca. [ancho, alto, escala]
const PANTALLAS_IPHONE: [number, number, number][] = [
  [440, 956, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
  [414, 736, 3],
];

export const metadata: Metadata = {
  title: "Control Total",
  description: "Inventario, ventas y caja para tu negocio. Desarrollado por EMY TELECOM.",
  // En iPhone, "Agregar a pantalla de inicio" la abre como aplicación, con este nombre e ícono.
  appleWebApp: {
    capable: true,
    title: "Control Total",
    statusBarStyle: "default",
    startupImage: PANTALLAS_IPHONE.map(([ancho, alto, escala]) => ({
      url: `/iconos/v2/inicio/inicio-${ancho * escala}x${alto * escala}.png`,
      media: `(device-width: ${ancho}px) and (device-height: ${alto}px) and (-webkit-device-pixel-ratio: ${escala}) and (orientation: portrait)`,
    })),
  },
  icons: { apple: "/iconos/v2/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111633",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className={`${letra.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full font-sans">
        {children}
        <CapturaInstalacion />
      </body>
    </html>
  );
}
