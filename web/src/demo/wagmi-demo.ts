/** Demo replacement for src/lib/wagmi.ts: one built-in test wallet on the simulated chain. */
import { createConfig, custom, injected } from "@wagmi/core";
import type { Chain, EIP1193Provider } from "viem";
import { SUPPORTED } from "@/lib/chains";
import { chain } from "./mock-api";

const WALLET_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0E1420"/><path d="M11 15a3 3 0 0 1 3-3h13v4" fill="none" stroke="#fff" stroke-width="2.2"/><rect x="11" y="15" width="18" height="14" rx="3" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="24.5" cy="22" r="1.6" fill="#fff"/></svg>',
  );

const provider = chain as unknown as EIP1193Provider;
const chains = SUPPORTED.map((c) => c.chain) as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  chains,
  multiInjectedProviderDiscovery: false,
  pollingInterval: 400,
  connectors: [injected({ target: () => ({ id: "testWallet", name: "Test Wallet", icon: WALLET_ICON, provider }) })],
  transports: Object.fromEntries(chains.map((c) => [c.id, custom(provider)])),
});
