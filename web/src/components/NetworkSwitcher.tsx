"use client";

import { useSwitchChain } from "wagmi";
import { SUPPORTED } from "@/lib/chains";
import { friendlyError } from "@/lib/errors";
import { Button } from "./ui";

export function NetworkSwitcher() {
  const { switchChain, isPending, error } = useSwitchChain();
  if (SUPPORTED.length === 0) {
    return (
      <p className="rounded-xl bg-warn-soft p-4 text-sm text-warn">
        No payroll contract is configured yet. Deploy it and set NEXT_PUBLIC_PAYROLL_ADDRESS_&lt;chainId&gt; (see the README).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-warn-soft p-4">
      <p className="text-sm font-medium text-warn">Your wallet is on a network Wagefold doesn&apos;t use. Switch to:</p>
      <div className="flex flex-wrap gap-2">
        {SUPPORTED.map((c) => (
          <Button key={c.chain.id} variant="secondary" disabled={isPending} onClick={() => switchChain({ chainId: c.chain.id })}>
            {c.chain.name}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-bad-text">{friendlyError(error)}</p>}
    </div>
  );
}
