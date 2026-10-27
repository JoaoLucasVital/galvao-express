import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Galvão Express | Fretes e Comissões",
  description: "Controle pessoal de fretes, ganhos e comissões do motorista.",
  manifest: "/manifest.webmanifest",
  applicationName: "Galvão Express",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Galvão Express",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
  openGraph: {
    title: "Galvão Express",
    description: "Controle de fretes e acompanhamento de comissões.",
    type: "website",
    images: [{ url: "/og-v2.png", width: 1672, height: 939, alt: "Galvão Express" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Galvão Express",
    description: "Controle de fretes e acompanhamento de comissões.",
    images: ["/og-v2.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e4f3ff" },
    { media: "(prefers-color-scheme: dark)", color: "#061321" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning><body>{children}</body></html>;
}