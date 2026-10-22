import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import { Providers } from "./providers";

const title = "Wagefold · Crypto payroll in one transaction";
const description = "Connect your treasury wallet and pay your whole team in USDC or USDT with one signature.";

export const metadata: Metadata = {
  // Absolute URLs for the social card; APP_DOMAIN is the public host in production.
  metadataBase: new URL(process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : "http://localhost:3000"),
  title,
  description,
  applicationName: "Wagefold",
  manifest: "/manifest.webmanifest",
  openGraph: { title, description, siteName: "Wagefold", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

// Fonts are downloaded at build time and served from this site: no request to Google from visitors'
// browsers, and nothing a third party could change after deploy.
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F6F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0D14" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The per-request CSP nonce from middleware; reading headers also renders pages per request.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
