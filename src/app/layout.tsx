import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SCRIPT_TEMA } from "@/components/layout/boton-tema";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Control Total",
  description: "Inventario, ventas y caja para tu negocio. Desarrollado por EMY TELECOM.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
