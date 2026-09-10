import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import { AppSidebar } from "@/components/view-transition/AppSidebar";
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
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased bg-background text-foreground">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var root = document.documentElement;
                  root.classList.toggle('dark', isDark);
                  root.setAttribute('data-mode', isDark ? 'dark' : 'light');
                  root.setAttribute('data-theme', isDark ? 'dark' : 'kumo');
                } catch (_) {}
              })();
            `,
          }}
        />
        <Providers>
          <Toaster />
          <div className="flex min-h-screen w-full items-stretch bg-kumo-canvas">
            <AppSidebar />
            <main className="flex-1 px-4 py-8 sm:px-8 min-w-0">
              <div className="flex flex-col gap-6 min-w-0">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
