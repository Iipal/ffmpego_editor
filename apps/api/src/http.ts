/**
 * Hono-aware error helper: every error response uses the shared
 * { code, message, issues?, requestId?, jobId? } envelope from
 * @repo/contracts. Status comes from ERROR_STATUS (single source of truth);
 * requestId honors `x-request-id` or is minted for log correlation.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  ERROR_STATUS,
  REQUEST_ID_HEADER,
  errorEnvelope,
  resolveRequestId,
  type EnvelopeOptions,
  type ErrorCode,
} from "@repo/contracts";

export function err(
  c: Context,
  code: ErrorCode,
  opts: Omit<EnvelopeOptions, "requestId"> & {
    requestId?: string;
    headers?: Record<string, string>;
  },
) {
  const requestId = opts.requestId ?? resolveRequestId(c.req.header(REQUEST_ID_HEADER));
  const { requestId: _ignored, headers, ...rest } = opts;
  const status = ERROR_STATUS[code] as ContentfulStatusCode;
  return c.json(errorEnvelope(code, { ...rest, requestId }), status, headers);
}

/** Framework-free variant for helpers returning plain Responses. */
export function errResponse(
  code: ErrorCode,
  opts: Omit<EnvelopeOptions, "requestId"> & { requestId?: string },
  headers?: Record<string, string>,
): Response {
  const requestId = opts.requestId ?? resolveRequestId(undefined);
  const { requestId: _ignored, ...rest } = opts;
  return Response.json(errorEnvelope(code, { ...rest, requestId }), {
    status: ERROR_STATUS[code],
    headers,
  });
}
