import type { Metadata } from "next";
import { Geist, Geist_Mono, Rajdhani } from "next/font/google";
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

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EMERGENCY STRIKE — Tactical FPS",
  description:
    "Tactical multiplayer FPS with CS2 gameplay and Warzone visuals. 4 game modes, urban map with interiors, 1v1 and 2v2 online rooms, full gamepad support. Play straight in your browser.",
  keywords: ["FPS", "shooter", "multiplayer", "three.js", "CS2", "Warzone", "browser game"],
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.svg`,
  },
  openGraph: {
    title: "EMERGENCY STRIKE — Tactical FPS",
    description: "Tactical FPS in your browser: 4 game modes, urban map, P2P multiplayer and gamepad support.",
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${rajdhani.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
