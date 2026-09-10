/**
 * FileStore lifecycle tests — run against an isolated :memory: database and a
 * unique tmp root per test. Never imports the app singleton (storage/index)
 * so no real DB or store root is touched.
 */
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createFileStore,
  extOf,
  FileStoreQuotaError,
  mimeForExt,
  RESERVED_STALE_MS,
  safeFilename,
  type FileStore,
} from "../src/storage/fileStore";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) {
    try {
      fs.rmSync(r, { recursive: true, force: true });
    } catch {}
  }
});

function makeStore(
  opts: { quotaBytes?: number; isJobAlive?: (id: string) => boolean } = {},
): {
  store: FileStore;
  db: Database;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "filestore-test-"));
  roots.push(root);
  const db = new Database(":memory:");
  const store = createFileStore(db, { root, ...opts });
  return { store, db };
}

describe("reserve → write → finalize → release", () => {
  test("full lifecycle tracks bytes and frees them on release", async () => {
    const { store } = makeStore();
    const { id, path: p } = store.AssetStore.reserve({
      kind: "request-input",
      filename: "My Clip.MKV",
    });
    expect(id).toMatch(/^ast_[0-9a-f]{32}$/);
    expect(p).toStartWith(store.root);
    expect(p.endsWith(".mkv")).toBe(true);

    let rec = store.AssetStore.get(id)!;
    expect(rec.status).toBe("reserved");
    expect(rec.byteSize).toBe(0);
    expect(rec.name).toBe("My_Clip.MKV"); // display name is sanitized

    await Bun.write(p, new Uint8Array([1, 2, 3, 4]));
    rec = store.AssetStore.finalize(id)!;
    expect(rec.status).toBe("active");
    expect(rec.byteSize).toBe(4);
    expect(fs.existsSync(p)).toBe(true);

    const r = store.AssetStore.release(id);
    expect(r).toMatchObject({
      deleted: true,
      bytesFreed: 4,
      alreadyGone: false,
    });
    expect(fs.existsSync(p)).toBe(false);
    expect(store.AssetStore.get(id)).toBeNull();
  });

  test("double release and unknown ids are idempotent no-ops", async () => {
    const { store } = makeStore();
    const { id, path: p } = store.ArtifactStore.reserve({
      kind: "output",
      filename: "export.mp4",
    });
    await Bun.write(p, "data");
    store.ArtifactStore.finalize(id);

    const first = store.ArtifactStore.release(id);
    expect(first.deleted).toBe(true);
    const second = store.ArtifactStore.release(id);
    expect(second).toMatchObject({
      deleted: false,
      alreadyGone: true,
      refCount: 0,
    });

    const unknown = store.ArtifactStore.release(
      "art_ffffffffffffffffffffffffffffffff",
    );
    expect(unknown).toMatchObject({ deleted: false, alreadyGone: true });
  });

  test("release with missing bytes still drops the row", async () => {
    const { store } = makeStore();
    const { id, path: p } = store.AssetStore.reserve({
      kind: "upload",
      filename: "clip.mp4",
    });
    // reserve creates the record only — simulate wiped tmp after bytes land.
    await Bun.write(p, "bytes");
    store.AssetStore.finalize(id);
    fs.unlinkSync(p); // bytes vanished out-of-band (wiped tmp)
    const r = store.AssetStore.release(id);
    expect(r.deleted).toBe(true);
    expect(r.bytesFreed).toBe(0);
    expect(store.AssetStore.get(id)).toBeNull();
  });
});

describe("adopt vs share refcounts", () => {
  test("adopt claims an unowned record without incrementing", async () => {
    const { store } = makeStore();
    const { id, path: p } = store.AssetStore.reserve({
      kind: "request-input",
      filename: "a.mp4",
    });
    await Bun.write(p, "x");
    store.AssetStore.finalize(id);

    const adopted = store.AssetStore.adopt(id, "job-1")!;
    expect(adopted.ownerJobId).toBe("job-1");
    expect(adopted.refCount).toBe(1);

    // Same-job adopt is a noop.
    const again = store.AssetStore.adopt(id, "job-1")!;
    expect(again.refCount).toBe(1);
  });

  test("adopt of a job-owned record falls back to share (owner kept, count +1)", () => {
    const { store } = makeStore();
    const { id } = store.AssetStore.reserve({
      kind: "upload",
      filename: "u.mp4",
      ownerJobId: "job-owner",
    });
    const rec = store.AssetStore.adopt(id, "job-other")!;
    expect(rec.ownerJobId).toBe("job-owner");
    expect(rec.refCount).toBe(2);
  });

  test("share sets owner when null, increments, and same-job is noop", () => {
    const { store } = makeStore();
    const { id } = store.AssetStore.reserve({
      kind: "upload",
      filename: "u.mp4",
    });
    let rec = store.AssetStore.share(id, "job-1")!;
    expect(rec.ownerJobId).toBe("job-1");
    expect(rec.refCount).toBe(2);
    rec = store.AssetStore.share(id, "job-1")!;
    expect(rec.refCount).toBe(2);
  });

  test("release decrements shared refs; bytes die at zero", async () => {
    const { store } = makeStore();
    const { id, path: p } = store.AssetStore.reserve({
      kind: "upload",
      filename: "shared.mp4",
    });
    await Bun.write(p, "12345");
    store.AssetStore.finalize(id);
    store.AssetStore.share(id, "job-1"); // refCount 2

    const dec = store.AssetStore.release(id);
    expect(dec).toMatchObject({
      deleted: false,
      alreadyGone: false,
      refCount: 1,
    });
    expect(fs.existsSync(p)).toBe(true);

    const last = store.AssetStore.release(id);
    expect(last.deleted).toBe(true);
    expect(last.bytesFreed).toBe(5);
    expect(fs.existsSync(p)).toBe(false);
  });
});

describe("quota gate", () => {
  test("reserve refuses when sizeHint breaches quota", () => {
    const { store } = makeStore({ quotaBytes: 100 });
    let thrown: unknown = null;
    try {
      store.AssetStore.reserve({
        kind: "upload",
        filename: "big.mp4",
        sizeHint: 101,
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(FileStoreQuotaError);
    expect((thrown as FileStoreQuotaError).neededBytes).toBe(101);
    expect((thrown as FileStoreQuotaError).quotaBytes).toBe(100);
    // Zero-hint reserves still pass; the gate counts finalized bytes too.
    const ok = store.AssetStore.reserve({
      kind: "upload",
      filename: "tiny.mp4",
    });
    expect(ok.id).toStartWith("ast_");

    const q = store.checkQuota(1000);
    expect(q.ok).toBe(false);
    expect(q.quotaBytes).toBe(100);
  });
});

describe("writeAtomic", () => {
  test("bytes land atomically and the record finalizes", async () => {
    const { store } = makeStore();
    const { id, path: p } = store.ArtifactStore.reserve({
      kind: "subtitle-png",
      filename: "sub0.png",
    });
    const rec = (await store.ArtifactStore.writeAtomic(id, "PNGDATA"))!;
    expect(rec.status).toBe("active");
    expect(rec.byteSize).toBe(7);
    expect(await Bun.file(p).text()).toBe("PNGDATA");
    // No .part siblings left behind.
    expect(
      fs.readdirSync(store.root).filter((f) => f.includes(".part-")),
    ).toEqual([]);
  });

  test("writeAtomic on unknown id returns null", async () => {
    const { store } = makeStore();
    expect(
      await store.ArtifactStore.writeAtomic(
        "art_00000000000000000000000000000000",
        "x",
      ),
    ).toBeNull();
  });
});

describe("descriptors never leak paths", () => {
  test("describe exposes id/name/size/mime only", () => {
    const { store } = makeStore();
    const { id } = store.ArtifactStore.reserve({
      kind: "output",
      filename: "export.webm",
    });
    const desc = store.ArtifactStore.describe(id)!;
    expect(desc).toMatchObject({
      id,
      name: "export.webm",
      ext: "webm",
      mime: "video/webm",
    });
    expect("path" in (desc as Record<string, unknown>)).toBe(false);
    expect(JSON.stringify(desc)).not.toContain(os.tmpdir());
  });
});

describe("fail-path tracking", () => {
  test("a reserve with no bytes is a tracked row, reaped as stale", () => {
    const { store, db } = makeStore();
    const { id } = store.AssetStore.reserve({
      kind: "upload",
      filename: "crash.mp4",
    });
    // Crashed between reserve and finalize: row exists, zero bytes on disk.
    expect(store.AssetStore.get(id)?.status).toBe("reserved");

    // Age it past the stale threshold, then reconcile.
    db.prepare(`UPDATE files SET updatedAt = ? WHERE id = ?`).run(
      Date.now() - RESERVED_STALE_MS - 1000,
      id,
    );
    const swept = store.reconcile();
    expect(swept.staleReserved).toBe(1);
    expect(store.AssetStore.get(id)).toBeNull();
  });
});

describe("sweepExpired + reconcile", () => {
  test("expired unowned files are reaped; live-job-owned are kept", async () => {
    const { store } = makeStore({ isJobAlive: (id) => id === "job-live" });
    const dead = store.AssetStore.reserve({
      kind: "upload",
      filename: "d.mp4",
      ttlMs: 0,
    });
    const live = store.AssetStore.reserve({
      kind: "upload",
      filename: "l.mp4",
      ttlMs: 0,
      ownerJobId: "job-live",
    });
    await Bun.write(dead.path, "dead");
    await Bun.write(live.path, "live");
    store.AssetStore.finalize(dead.id);
    store.AssetStore.finalize(live.id);

    const out = store.sweepExpired(Date.now() + 60_000);
    expect(out.expired).toBe(1);
    expect(out.bytesFreed).toBe(4);
    expect(store.AssetStore.get(dead.id)).toBeNull();
    expect(store.AssetStore.get(live.id)).not.toBeNull();
  });

  test("pinned paths survive the stale-reserved reap", () => {
    const { store, db } = makeStore();
    const { id, path: p } = store.AssetStore.reserve({
      kind: "upload",
      filename: "slow.mp4",
    });
    db.prepare(`UPDATE files SET updatedAt = ? WHERE id = ?`).run(
      Date.now() - RESERVED_STALE_MS - 1000,
      id,
    );
    const out = store.sweepExpired(Date.now(), new Set([p]));
    expect(out.staleReserved).toBe(0);
    expect(store.AssetStore.get(id)).not.toBeNull();
  });

  test("reconcile purges rows with missing bytes and deletes orphans", async () => {
    const { store } = makeStore();
    const { id, path: p } = store.ArtifactStore.reserve({
      kind: "output",
      filename: "gone.mp4",
    });
    await Bun.write(p, "render");
    store.ArtifactStore.finalize(id);
    fs.unlinkSync(p); // wiped tmp: row without bytes

    const orphanPath = path.join(store.root, "dropped-by-crash.mp4");
    await Bun.write(orphanPath, "orphan");

    const out = store.reconcile();
    expect(out.missing).toBe(1);
    expect(out.orphans).toBe(1);
    expect(out.bytesFreed).toBe(6);
    expect(store.ArtifactStore.get(id)).toBeNull();
    expect(fs.existsSync(orphanPath)).toBe(false);

    // Idempotent: second run finds nothing.
    const again = store.reconcile();
    expect(again).toMatchObject({
      expired: 0,
      staleReserved: 0,
      missing: 0,
      orphans: 0,
      bytesFreed: 0,
    });
  });

  test("young .part files are left alone by reconcile", async () => {
    const { store } = makeStore();
    const partPath = path.join(store.root, "some-id.mp4.part-abcdef12");
    await Bun.write(partPath, "inflight");
    const out = store.reconcile();
    expect(out.orphans).toBe(0);
    expect(fs.existsSync(partPath)).toBe(true);
  });
});

describe("stats / checkQuota / managedBytes", () => {
  test("stats reflect finalized bytes by role and kind", async () => {
    const { store } = makeStore();
    const a = store.AssetStore.reserve({ kind: "upload", filename: "a.mp4" });
    const b = store.ArtifactStore.reserve({
      kind: "output",
      filename: "b.mp4",
      ownerJobId: "j",
    });
    await Bun.write(a.path, "1234");
    await Bun.write(b.path, "12345678");
    store.AssetStore.finalize(a.id);
    store.ArtifactStore.finalize(b.id);

    const s = store.stats();
    expect(s.files).toBe(2);
    expect(s.bytes).toBe(12);
    expect(s.byRole).toMatchObject({ asset: 1, artifact: 1 });
    expect(s.byKind).toMatchObject({ upload: 1, output: 1 });
    expect(store.managedBytes()).toBe(12);
    expect(store.checkQuota(1).ok).toBe(true);
  });
});

describe("filename helpers", () => {
  test("safeFilename strips traversal and unsafe chars", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("my clip (1).mp4")).toBe("my_clip__1_.mp4");
    expect(safeFilename("")).toBe("file");
  });
  test("extOf falls back to bin", () => {
    expect(extOf("clip.MP4")).toBe("mp4");
    expect(extOf("noext")).toBe("bin");
    expect(extOf("weird.!!!!")).toBe("bin");
  });
  test("mimeForExt maps known types", () => {
    expect(mimeForExt("mp4")).toBe("video/mp4");
    expect(mimeForExt("webm")).toBe("video/webm");
    expect(mimeForExt("zzz")).toBe("application/octet-stream");
  });
});
