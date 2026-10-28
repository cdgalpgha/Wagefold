import type { Instrumentation } from "next";
import { logError } from "./lib/server/log";

export function register() {}

/** Any error a page or API route throws: logged as JSON (and sent to Sentry if configured). */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  logError("request_error", err, {
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    digest: (err as { digest?: string }).digest,
  });
};
