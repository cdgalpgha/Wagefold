import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EBEFE8" },
    { media: "(prefers-color-scheme: dark)", color: "#0B110E" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The per-request CSP nonce from middleware; reading headers also renders pages per request.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..800&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
