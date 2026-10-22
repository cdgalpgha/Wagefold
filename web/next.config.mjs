/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Pages get a nonce-based Content-Security-Policy from src/middleware.ts.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Isolate the window from cross-origin openers, but keep wallet popups (Coinbase) able to reply.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // No X-Frame-Options: it can't allow the Safe app, and CSP frame-ancestors supersedes it.
          // No Cross-Origin-Embedder-Policy: require-corp would block wallet icons and wallet SDKs.
        ],
      },
      {
        // JSON only: nothing in an API response may load, run or be framed.
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      },
    ];
  },
  // Keep the embedded Postgres (WASM) and pg driver out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  webpack: (config) => {
    // Optional peer deps pulled in by wallet SDKs that are not needed in the browser build.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    // Coinbase's Base Account SDK optionally imports x402 payment packages that Wagefold never uses.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};

export default nextConfig;
