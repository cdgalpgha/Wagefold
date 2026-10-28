/**
 * Polling for what other people change while you're looking: a payroll the accounts team just signed,
 * a sign-off, the treasury's payment, the activity log. Every 10 seconds while the tab is visible, and
 * straight away when you come back to it. A hidden tab doesn't poll.
 */
export const LIVE = { refetchInterval: 10_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true } as const;

/** Slower-changing data: your role and the company's payroll rule. */
export const LIVE_SLOW = { ...LIVE, refetchInterval: 30_000 } as const;
