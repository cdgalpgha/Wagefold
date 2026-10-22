import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { installMockApi } from "./mock-api";
import { DemoBanner, WalletPopup } from "./DemoChrome";
import { Providers } from "@/app/providers";
import { AppShell } from "@/components/AppShell";

installMockApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <DemoBanner />
      <AppShell />
      <WalletPopup />
    </Providers>
  </StrictMode>,
);
