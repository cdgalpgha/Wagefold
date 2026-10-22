"use client";

import { useAccount } from "wagmi";
import { useSession } from "@/hooks/useSession";
import { ConnectScreen } from "./ConnectScreen";
import { Dashboard } from "./Dashboard";
import { SignInScreen } from "./SignInScreen";
import { Spinner } from "./ui";

/** Connect wallet → sign in with that wallet → app. */
export function AppShell() {
  const { address, status } = useAccount();
  const session = useSession();

  if (status === "reconnecting" || (status === "connecting" && !address)) return <FullPageSpinner />;
  if (!address) return <ConnectScreen />;
  if (session.isLoading) return <FullPageSpinner />;
  if (!session.data || session.data.address.toLowerCase() !== address.toLowerCase()) return <SignInScreen />;
  return <Dashboard me={session.data} />;
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-brand" role="status" aria-label="Loading">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
