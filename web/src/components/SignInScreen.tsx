"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { api } from "@/lib/api";
import { getChainConfig } from "@/lib/chains";
import { friendlyError } from "@/lib/errors";
import { Logo } from "./Logo";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { Button, Card, shortAddress, Spinner } from "./ui";

export function SignInScreen() {
  const { address, chainId, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cfg = getChainConfig(chainId);

  async function signIn() {
    if (!address || !chainId) return;
    setBusy(true);
    setError(null);
    try {
      const { nonce } = await api<{ nonce: string }>("/api/auth/nonce");
      const message = createSiweMessage({
        address,
        chainId,
        domain: window.location.host,
        uri: window.location.origin,
        nonce,
        version: "1",
        statement: "Sign in to Wagefold. This does not move any funds or cost gas.",
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      });
      const signature = await signMessageAsync({ message });
      await api("/api/auth/verify", { body: { message, signature } });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <Logo className="h-7" />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-6 py-14">
        <Card className="h-fit w-full max-w-[560px] p-9">
          <p className="text-sm font-medium text-ink-2">
            Connected with {connector?.name ?? "your wallet"} · <span className="font-mono">{address && shortAddress(address)}</span>
          </p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-tight">Sign in with your wallet</h1>
          <p className="mt-2 text-base leading-relaxed text-ink-2">
            Sign a short message to prove this wallet is yours. It doesn&apos;t move any funds or cost gas.
          </p>
          {cfg ? (
            <Button size="lg" className="mt-6 w-full" onClick={signIn} disabled={busy}>
              {busy ? <Spinner /> : null}
              {busy ? "Check your wallet" : "Sign in"}
            </Button>
          ) : (
            <div className="mt-6">
              <NetworkSwitcher />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-bad-text">
              {error}
            </p>
          )}
          <button type="button" onClick={() => disconnect()} className="mt-5 min-h-11 text-sm text-ink-2 hover:text-ink">
            Use a different wallet
          </button>
        </Card>
      </main>
    </div>
  );
}
