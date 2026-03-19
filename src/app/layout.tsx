import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  Caveat,
  Pacifico,
  Dancing_Script,
  Great_Vibes,
  Sacramento,
  Satisfy,
  Lobster,
  Alex_Brush,
  Playball,
  Kalam,
} from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { I18nProvider } from "@/lib/i18n";
import { Navbar } from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["400", "700"] });
const pacifico = Pacifico({ variable: "--font-pacifico", subsets: ["latin"], weight: "400" });
const dancingScript = Dancing_Script({ variable: "--font-dancing-script", subsets: ["latin"], weight: ["400", "700"] });
const greatVibes = Great_Vibes({ variable: "--font-great-vibes", subsets: ["latin"], weight: "400" });
const sacramento = Sacramento({ variable: "--font-sacramento", subsets: ["latin"], weight: "400" });
const satisfy = Satisfy({ variable: "--font-satisfy", subsets: ["latin"], weight: "400" });
const lobster = Lobster({ variable: "--font-lobster", subsets: ["latin"], weight: "400" });
const alexBrush = Alex_Brush({ variable: "--font-alex-brush", subsets: ["latin"], weight: "400" });
const playball = Playball({ variable: "--font-playball", subsets: ["latin"], weight: "400" });
const kalam = Kalam({ variable: "--font-kalam", subsets: ["latin"], weight: ["400", "700"] });

const fontVars = [
  geistSans.variable,
  geistMono.variable,
  caveat.variable,
  pacifico.variable,
  dancingScript.variable,
  greatVibes.variable,
  sacramento.variable,
  satisfy.variable,
  lobster.variable,
  alexBrush.variable,
  playball.variable,
  kalam.variable,
].join(" ");

import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Connect — 连接对的人，帮你做对的事",
  description: "以 AI 分身为核心的需求撮合与任务执行平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${fontVars} antialiased bg-white dark:bg-black text-gray-900 dark:text-white`}
      >
        <SessionProvider>
          <I18nProvider>
            <ThemeProvider>
              <Navbar />
              {children}
            </ThemeProvider>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
