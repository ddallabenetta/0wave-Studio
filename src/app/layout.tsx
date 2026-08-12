import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/state/theme-store";
import "./globals.css";

/**
 * Runs before hydration so a forced theme never flashes the wrong palette.
 * "system" (the default) is resolved by CSS and needs no attribute.
 */
const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"system";}catch(e){document.documentElement.dataset.theme="system";}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "0wave Studio",
    template: "%s - 0wave Studio",
  },
  description: "A web synthesizer and sketchpad for sound. Build sounds in the Studio, compose with them in the Playground.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
