// Builds the self-contained artifact demo (one HTML file): `npm run build:demo`.
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const src = path.resolve(__dirname, "src");
const env = (v: string | undefined) => JSON.stringify(v ?? "");

export default defineConfig({
  root: path.resolve(__dirname, "demo"),
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: [
      { find: "@/lib/wagmi", replacement: path.join(src, "demo/wagmi-demo.ts") },
      { find: "@/lib/download", replacement: path.join(src, "demo/download-demo.ts") },
      { find: /^@\//, replacement: `${src}/` },
    ],
  },
  define: {
    "process.env.NEXT_PUBLIC_DEMO": env("1"),
    "process.env.NEXT_PUBLIC_PAYROLL_ADDRESS_8453": env(""),
    "process.env.NEXT_PUBLIC_PAYROLL_ADDRESS_84532": env(""),
    "process.env.NEXT_PUBLIC_PAYROLL_ADDRESS_31337": env("0x5FbDB2315678afecb367f032d93F642f64180aa3"),
    "process.env.NEXT_PUBLIC_USDC_ADDRESS_8453": env(""),
    "process.env.NEXT_PUBLIC_USDC_ADDRESS_84532": env(""),
    "process.env.NEXT_PUBLIC_USDC_ADDRESS_31337": env("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"),
    "process.env.NEXT_PUBLIC_USDT_ADDRESS_8453": env(""),
    "process.env.NEXT_PUBLIC_USDT_ADDRESS_84532": env(""),
    "process.env.NEXT_PUBLIC_USDT_ADDRESS_31337": env("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"),
    "process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID": env(""),
  },
  build: { outDir: path.resolve(__dirname, "demo-dist"), emptyOutDir: true, target: "es2020", chunkSizeWarningLimit: 5000 },
  logLevel: "warn",
});
