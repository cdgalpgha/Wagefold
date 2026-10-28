"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { LIVE_SLOW } from "@/lib/live";
import type { Me } from "@/lib/types";

export function useSession() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<Me>("/api/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    // Picks up a role change, a new payroll rule, or removal from the team without a reload.
    ...LIVE_SLOW,
  });
}
