"use client";

import { useAccount } from "wagmi";
import { useSession } from "@/hooks/useSession";
import { Dashboard } from "./Dashboard";
import { Landing } from "./Landing";
import { SignInScreen } from "./SignInScreen";
import { LogoMark } from "./Logo";

/** Landing page → connect wallet → sign in with that wallet → app. */
export function AppShell() {
  const { address, status } = useAccount();
  const session = useSession();

  if (status === "reconnecting" || (status === "connecting" && !address)) return <FullPageSpinner />;
  if (!address) return <Landing />;
  if (session.isLoading) return <FullPageSpinner />;
  if (!session.data || session.data.address.toLowerCase() !== address.toLowerCase()) return <SignInScreen />;
  return <Dashboard me={session.data} />;
}

/** The mark "folds" in while the wallet reconnects: the brand's one moment of motion in the app. */
function FullPageSpinner() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4" role="status" aria-label="Loading">
      <LogoMark className="wf-fold h-12 w-12" />
      <span className="text-sm text-ink-3">Loading Wagefold…</span>
    </div>
  );
}
