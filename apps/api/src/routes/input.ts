import type { Context } from "hono";
import {
  MULTIPART_FIELDS,
  UPLOAD_ID_HEADER,
  UPLOAD_ID_QUERY,
} from "@repo/contracts";
import { reserveRequestAsset } from "../storage/index.js";
import { consumeUpload } from "./upload.js";

export interface ResolvedRequestInput {
  /** Owning asset record (chunked session file, or fresh request-input). */
  assetId: string | null;
  temporaryPath: string;
  filename: string;
  isChunked: boolean;
  /** True for single-shot direct uploads (caller releases after use). */
  remove: boolean;
}

export type ResolveInputMiss = "upload-not-found" | "no-input";

/**
 * One shared input resolver (was triplicated in video/audio/metadata routes):
 * uploadId via `x-upload-id` header, `?uploadId` query, or multipart
 * `uploadId` field (chunked session, shared bytes) — else a direct multipart
 * `file` (record-before-bytes via reserveRequestAsset, caller-owned).
 * Throws FileStoreQuotaError (callers map it to 507); never leaks paths.
 */
export async function resolveRequestInput(
  c: Context,
  form: FormData | null,
): Promise<
  | { ok: true; input: ResolvedRequestInput }
  | { ok: false; reason: ResolveInputMiss }
> {
  const headerId = c.req.header(UPLOAD_ID_HEADER);
  const queryId = c.req.query(UPLOAD_ID_QUERY);
  const field = form?.get(MULTIPART_FIELDS.uploadId);
  const uploadId =
    headerId ??
    queryId ??
    (typeof field === "string" ? field.trim() || null : null);
  if (uploadId) {
    const consumed = consumeUpload(uploadId);
    if (!consumed) return { ok: false, reason: "upload-not-found" };
    return {
      ok: true,
      input: {
        assetId: consumed.assetId,
        temporaryPath: consumed.path,
        filename: consumed.filename,
        isChunked: true,
        remove: false,
      },
    };
  }
  const file = form?.get(MULTIPART_FIELDS.file);
  if (!(file instanceof File)) return { ok: false, reason: "no-input" };
  const { id, path } = await reserveRequestAsset(file);
  return {
    ok: true,
    input: {
      assetId: id,
      temporaryPath: path,
      filename: file.name,
      isChunked: false,
      remove: true,
    },
  };
}
