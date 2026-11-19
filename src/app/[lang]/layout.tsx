import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { lang } from "next/root-params";
import { locales } from "@/i18n/config";
import { getI18n } from "@/i18n";
import "../globals.css";
import "../role-theme.css";
import "../motion.css";
import { ThemeBoot } from "@/components/theme-boot";

const bodyFont = Inter({
  // The shared stylesheet names its sans variable after Geist, so this keeps that name. Numbers (marks, times) use
  // the same face with even-width digits (role-theme.css), so there is no second font to load.
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.meta.appName, template: `%s · ${t.meta.appName}` },
    description: t.meta.description,
    applicationName: t.meta.appName,
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1220" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <html lang={await lang()} className={`${bodyFont.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <ThemeBoot />
        {children}
      </body>
    </html>
  );
}
