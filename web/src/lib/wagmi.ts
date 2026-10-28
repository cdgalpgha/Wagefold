import { createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected, safe, walletConnect } from "wagmi/connectors";
import type { Chain } from "viem";
import { SUPPORTED } from "./chains";
import { transportFor } from "./rpc";
import { walletMetadata } from "./app-url";

const configured = SUPPORTED.map((c) => c.chain);
// wagmi needs at least one chain; the UI explains when no payroll contract is configured yet.
const chains = (configured.length ? configured : [baseSepolia]) as [Chain, ...Chain[]];
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const metadata = walletMetadata();

export const wagmiConfig = createConfig({
  chains,
  ssr: true,
  connectors: [
    injected(),
    coinbaseWallet({ appName: metadata.name, appLogoUrl: metadata.icons[0], preference: "all" }),
    ...(wcProjectId
      ? [
          walletConnect({
            projectId: wcProjectId,
            showQrModal: true,
            metadata,
          }),
        ]
      : []),
    safe(),
  ],
  transports: Object.fromEntries(chains.map((c) => [c.id, transportFor(c.id)])),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
