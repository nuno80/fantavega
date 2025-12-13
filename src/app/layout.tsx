// src/app/layout.tsx v.1.2
// Layout radice con font Geist personalizzati e integrazione SocketProvider.
// 1. Importazioni
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

// <-- NUOVA IMPORTAZIONE
import { ClerkProvider } from "@clerk/nextjs";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
// <-- NUOVA IMPORTAZIONE
import { SocketProvider } from "@/contexts/SocketContext";

import "./globals.css";

// 2. Definizione dei tuoi font personalizzati (MANTENUTA)
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 3. I tuoi metadati (MANTENUTI)
export const metadata: Metadata = {
  title: "FantaVega",
  description: "Fantacalcio Auction System",
};

// 4. Componente Layout Radice
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        {/* La tua struttura di classi per i font (MANTENUTA) */}
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {/* 5. Aggiunta del SocketProvider intorno ai children */}
            <SocketProvider>{children}</SocketProvider>

            {/* 6. Aggiunta del Toaster per le notifiche */}
            <Toaster position="top-right" richColors />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
