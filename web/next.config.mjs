/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep the embedded Postgres (WASM) and pg driver out of the server bundle.
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"],
  },
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
