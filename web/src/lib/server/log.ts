/**
 * Server error logs as one JSON object per line, so a log drain can search and alert on them. If
 * SENTRY_DSN is set, errors also go to Sentry from the server, with no SDK and nothing in the
 * browser bundle. Neither ever includes request headers, cookies or bodies.
 */

/** Keeps a URL's scheme and host but drops its path and query, where RPC providers put API keys. */
export function redact(text: string): string {
  return text.replace(/\b(https?|wss?):\/\/([^/\s"'`]+)[^\s"'`)]*/g, (_m, scheme: string, host: string) => `${scheme}://${host.replace(/^[^@]*@/, "")}/…`);
}

type Context = Record<string, string | number | boolean | null | undefined>;

export function logError(event: string, err: unknown, context: Context = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  const entry = {
    level: "error",
    time: new Date().toISOString(),
    event,
    error: e.name,
    message: redact(e.message).slice(0, 2000),
    stack: e.stack ? redact(e.stack).split("\n").slice(1, 8).map((l) => l.trim()) : undefined,
    ...context,
  };
  console.error(JSON.stringify(entry));
  void reportToSentry(entry).catch(() => undefined);
}

/** Where and how to send an event for this DSN, or null if it isn't a valid https DSN. */
export function sentryTarget(dsn: string | undefined): { url: string; auth: string; dsn: string } | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (u.protocol !== "https:" || !u.username || !/^\d+$/.test(project)) return null;
    return {
      url: `https://${u.host}/api/${project}/envelope/`,
      auth: `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=wagefold/1`,
      dsn,
    };
  } catch {
    return null;
  }
}

/** One Sentry envelope holding one error event. */
type Entry = { event: string; error: string; message: string; time: string; stack?: string[]; [key: string]: unknown };

export function sentryEnvelope(entry: Entry, dsn: string): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  const { event, error, message, time, stack, level: _level, ...extra } = entry;
  const body = {
    event_id: id,
    timestamp: Date.parse(time) / 1000,
    platform: "node",
    level: "error",
    logger: "wagefold",
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tags: { event },
    exception: { values: [{ type: error, value: message }] },
    extra: { ...extra, stack },
  };
  return [JSON.stringify({ event_id: id, sent_at: new Date().toISOString(), dsn }), JSON.stringify({ type: "event" }), JSON.stringify(body)].join("\n");
}

async function reportToSentry(entry: Entry): Promise<void> {
  const target = sentryTarget(process.env.SENTRY_DSN);
  if (!target) return;
  await fetch(target.url, {
    method: "POST",
    headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": target.auth },
    body: sentryEnvelope(entry, target.dsn),
    signal: AbortSignal.timeout(3000),
  });
}
