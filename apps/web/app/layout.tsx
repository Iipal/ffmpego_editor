import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import { AppHeader } from "@/components/view-transition/AppHeader";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FFmpeg Editor",
  description: "Local video editor powered by FFmpeg",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      data-theme="kumo"
    >
      <body className="min-h-full flex flex-col antialiased bg-background text-foreground">
        <Providers>
          <main className="min-h-screen bg-kumo-canvas px-4 py-8 sm:px-8">
            <div className="mx-auto flex w-full max-w-400 flex-col gap-6">
              <AppHeader />
              {children}
            </div>
          </main>
          <div
            style={{ viewTransitionName: "toaster" } as React.CSSProperties}
            className="pointer-events-none fixed inset-0"
          >
            <Toaster />
          </div>
        </Providers>
      </body>
    </html>
  );
}
