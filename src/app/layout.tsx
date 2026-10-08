import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { CapturaInstalacion } from "@/components/cuenta/instalar-app";
import { SCRIPT_TEMA } from "@/components/layout/boton-tema";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Control Total",
  description: "Inventario, ventas y caja para tu negocio. Desarrollado por EMY TELECOM.",
  // En iPhone, "Agregar a pantalla de inicio" la abre como aplicación, con este nombre e ícono.
  appleWebApp: { capable: true, title: "Control Total", statusBarStyle: "default" },
  icons: { apple: "/iconos/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111633",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
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
