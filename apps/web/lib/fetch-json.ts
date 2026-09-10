// Shared GET-JSON funnel for lightweight polling endpoints (health, storage
// census, upload sessions): base-URL guard + abort timeout + human error
// shaping in one place so the services stay thin. Non-2xx throws
// "`<label>` responded with HTTP <status>."; timeouts and connection
// failures throw "…is the backend running on …?" messages the Query hooks
// and the preflight probe surface directly.
import { apiClient } from "./api-client";

export async function fetchJson<T>(
  path: string,
  opts: { timeoutMs: number; label: string; notFoundNull?: boolean },
): Promise<T> {
  const baseUrl = apiClient.baseUrl;
  if (!baseUrl) throw new Error("API base URL not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(apiClient.url(path), { signal: ctrl.signal });
    if (res.status === 404 && opts.notFoundNull) return null as T;
    if (!res.ok) {
      throw new Error(`${opts.label} responded with HTTP ${res.status}.`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(
        `${opts.label} timed out — is the backend running on ${baseUrl}?`,
      );
    }
    if (e instanceof Error) {
      if (e.message.startsWith(`${opts.label} responded`)) throw e;
      throw new Error(
        `API unreachable — is the backend running on ${baseUrl}?`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
