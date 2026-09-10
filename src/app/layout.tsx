import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EMERGENCY STRIKE — FPS multijugador",
  description:
    "FPS táctico multijugador estilo CS2 con estética Warzone. 4 modos de juego, mapa urbano con interiores, multijugador 1v1 por salas y soporte de mando. Juega directo en el navegador.",
  keywords: ["FPS", "shooter", "multijugador", "three.js", "CS2", "Warzone", "juego navegador"],
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.svg`,
  },
  openGraph: {
    title: "EMERGENCY STRIKE — FPS multijugador",
    description: "FPS táctico en el navegador: 4 modos de juego, mapa urbano, multijugador P2P y mando compatible.",
    siteName: "EMERGENCY STRIKE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
