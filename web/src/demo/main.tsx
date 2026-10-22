import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { installMockApi } from "./mock-api";
import { DemoBanner, WalletPopup } from "./DemoChrome";
import { Providers } from "@/app/providers";
import { AppShell } from "@/components/AppShell";
import { storedTheme } from "@/lib/theme";

installMockApi();
// A saved explicit choice wins; "system" leaves any theme the host page set in place.
const saved = storedTheme();
if (saved !== "system") document.documentElement.setAttribute("data-theme", saved);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <DemoBanner />
      <AppShell />
      <WalletPopup />
    </Providers>
  </StrictMode>,
);
