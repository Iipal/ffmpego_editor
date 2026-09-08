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

export const { AssetStore, ArtifactStore } = store;
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
