/**
 * Process-wide FileStore singleton bound to the real SQLite database.
 * Tests must use `createFileStore(new Database(":memory:"))` instead —
 * never import this module in tests (itdirtouches the production DB file).
 */
import { db, getJob } from "../db.js";
import {
  createFileStore,
  DEFAULT_QUOTA_BYTES,
  defaultStoreRoot,
} from "./fileStore.js";

const quotaEnv = Number(Bun.env.STORE_QUOTA_BYTES ?? DEFAULT_QUOTA_BYTES);

export const store = createFileStore(db, {
  root: Bun.env.STORE_ROOT || defaultStoreRoot(),
  quotaBytes:
    Number.isFinite(quotaEnv) && quotaEnv > 0 ? quotaEnv : DEFAULT_QUOTA_BYTES,
  // Lets expiry reap files whose owner job row was deleted out-of-band.
  isJobAlive: (jobId) => getJob(jobId) !== null,
});

/**
 * Reserve + write + finalize a single-shot request upload as an asset
 * record. Throws FileStoreQuotaError on quota breach (routes map it to 507
 * via quotaExceeded); releases the reservation if bytes fail to land, so a
 * failed write leaves a tracked row, never a stray file.
 */
export async function reserveRequestAsset(
  file: File,
): Promise<{ id: string; path: string }> {
  const size = Number.isFinite(file.size) ? file.size : 0;
  const { id, path } = store.reserve({
    role: "asset",
    kind: "request-input",
    filename: file.name || "upload.bin",
    mime: file.type || undefined,
    sizeHint: size,
  });
  try {
    await Bun.write(path, file);
  } catch (e) {
    store.release(id);
    throw e;
  }
  store.finalize(id);
  return { id, path };
}
export type { FileStore } from "./fileStore.js";
export {
  extOf,
  FileStoreError,
  FileStoreQuotaError,
  mimeForExt,
  safeFilename,
  type FileDescriptor,
  type FileRecord,
  type ReleaseResult,
  type SweepResult,
} from "./fileStore.js";
