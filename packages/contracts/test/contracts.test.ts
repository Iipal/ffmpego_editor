// Contracts tests: versioned plan migration, error envelope builders,
// legacy read-compat, and FFmpeg exit classification.
import { describe, expect, test } from "bun:test";
import {
  classifyFfmpegExit,
  detectLegacyKind,
  errorEnvelope,
  ERROR_STATUS,
  issuesFromUnknown,
  messageFromUnknown,
  migrateRenderPlan,
  parseSettingsJson,
  PLAN_VERSION,
  resolveRequestId,
  genericSettingsSchema,
  mobileSettingsSchema,
  cutSettingsSchema,
} from "../src/index.js";

const genericV0 = {
  exportFormat: "mp4",
  crop: { x: 0, y: 0, width: 100, height: 100 },
  sourceWidth: 1920,
  sourceHeight: 1080,
  trimRange: [0, 10],
  exportFps: 30,
  exportSpeed: 1,
  exportQuality: 18,
  exportFilename: "clip",
};

const mobileV0 = {
  ...genericV0,
  exportFormat: undefined,
  crop: undefined,
  mobileLayout: {
    mode: "stacked",
    splitRatio: 0.5,
    zones: [
      { x: 0, y: 0, width: 1, height: 0.5 },
      { x: 0, y: 0.5, width: 1, height: 0.5 },
    ],
  },
};

const cutV0 = {
  mode: "full-size",
  cuts: [{ start: 0, end: 5 }],
  sourceWidth: 1920,
  sourceHeight: 1080,
  exportFps: 30,
  exportQuality: 18,
  exportSpeed: 1,
  exportFilename: "cut",
};

describe("migrateRenderPlan", () => {
  test("v0 generic bare settings migrate with kind detection", () => {
    const r = migrateRenderPlan(structuredClone(genericV0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.version).toBe(PLAN_VERSION);
    expect(r.plan.kind).toBe("generic");
  });

  test("v0 mobile settings detect mobile kind", () => {
    const raw = structuredClone(mobileV0) as Record<string, unknown>;
    delete raw.exportFormat;
    const r = migrateRenderPlan(raw, "mobile");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.kind).toBe("mobile");
  });

  test("v0 cut settings detect cut kind", () => {
    const r = migrateRenderPlan(structuredClone(cutV0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.kind).toBe("cut");
  });

  test("v1 plan passes through", () => {
    const r = migrateRenderPlan({
      version: PLAN_VERSION,
      kind: "generic",
      settings: structuredClone(genericV0),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.kind).toBe("generic");
  });

  test("unknown version is rejected with unsupported-version", () => {
    const r = migrateRenderPlan({
      version: PLAN_VERSION + 1,
      kind: "generic",
      settings: genericV0,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unsupported-version");
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test("invalid v0 settings are rejected with issues", () => {
    const r = migrateRenderPlan({ exportFormat: "mp4" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid");
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test("non-object payloads are rejected", () => {
    for (const raw of [null, "x", 42, []]) {
      const r = migrateRenderPlan(raw);
      expect(r.ok).toBe(false);
    }
  });

  test("v1 with invalid settings is rejected", () => {
    const r = migrateRenderPlan({
      version: PLAN_VERSION,
      kind: "cut",
      settings: { mode: "nope" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid");
  });
});

describe("detectLegacyKind", () => {
  test("cuts → cut, mobileLayout → mobile, exportFormat → generic", () => {
    expect(detectLegacyKind({ cuts: [] })).toBe("cut");
    expect(detectLegacyKind({ mobileLayout: {} })).toBe("mobile");
    expect(detectLegacyKind({ exportFormat: "mp4" })).toBe("generic");
    expect(detectLegacyKind({})).toBeNull();
  });
});

describe("parseSettingsJson", () => {
  test("accepts a JSON string, rejects the rest", () => {
    expect(
      parseSettingsJson(JSON.stringify(genericV0), genericSettingsSchema).ok,
    ).toBe(true);
    expect(parseSettingsJson(genericV0, genericSettingsSchema).ok).toBe(false);
    expect(parseSettingsJson("{nope", genericSettingsSchema).ok).toBe(false);
    const bad = parseSettingsJson(
      JSON.stringify({ exportFormat: "mp4" }),
      genericSettingsSchema,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.length).toBeGreaterThan(0);
  });

  test("per-hook schemas accept their own payloads", () => {
    const mobile = { ...mobileV0 };
    delete (mobile as Record<string, unknown>).exportFormat;
    expect(
      parseSettingsJson(JSON.stringify(mobile), mobileSettingsSchema).ok,
    ).toBe(true);
    expect(parseSettingsJson(JSON.stringify(cutV0), cutSettingsSchema).ok).toBe(
      true,
    );
  });
});

describe("errorEnvelope", () => {
  test("builds envelope, omits empty optionals", () => {
    const e = errorEnvelope("JOB_NOT_FOUND", { message: "gone" });
    expect(e).toEqual({ code: "JOB_NOT_FOUND", message: "gone" });
    const full = errorEnvelope("VALIDATION_FAILED", {
      message: "bad",
      issues: ["a: wrong"],
      requestId: "r1",
      jobId: "j1",
      details: { n: 1 },
    });
    expect(full.issues).toEqual(["a: wrong"]);
    expect(full.requestId).toBe("r1");
    expect(full.details).toEqual({ n: 1 });
  });

  test("every code maps to an HTTP status", () => {
    for (const code of [
      "JOB_NOT_FOUND",
      "VALIDATION_FAILED",
      "QUOTA_EXCEEDED",
      "QUEUE_FULL",
      "PLAN_VERSION_UNSUPPORTED",
      "TRANSCODE_FAILED",
      "UNSUPPORTED_MEDIA",
      "FFPROBE_FAILED",
    ] as const) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(ERROR_STATUS["QUEUE_FULL"]).toBe(429);
    expect(ERROR_STATUS["QUOTA_EXCEEDED"]).toBe(507);
  });
});

describe("request id + legacy compat", () => {
  test("resolveRequestId honors safe headers, mints otherwise", () => {
    expect(resolveRequestId("abc-123_X")).toBe("abc-123_X");
    const minted = resolveRequestId(null);
    expect(minted.length).toBeGreaterThan(0);
    expect(resolveRequestId("has spaces!!")).not.toBe("has spaces!!");
  });

  test("message/issues read envelope and legacy shapes", () => {
    expect(
      messageFromUnknown({ code: "X", message: "new" }, "fb"),
    ).toBe("new");
    expect(messageFromUnknown({ error: "old" }, "fb")).toBe("old");
    expect(messageFromUnknown(null, "fb")).toBe("fb");
    expect(issuesFromUnknown({ issues: ["a", 1, "b"] })).toEqual(["a", "b"]);
    expect(issuesFromUnknown({})).toEqual([]);
  });
});

describe("classifyFfmpegExit", () => {
  test("exit 0 is success-shaped", () => {
    expect(classifyFfmpegExit(0).code).toBe("TRANSCODE_FAILED");
    expect(classifyFfmpegExit(0).retryable).toBe(false);
  });
  test("SIGKILL/SIGTERM are retryable", () => {
    for (const code of [137, 143]) {
      const c = classifyFfmpegExit(code);
      expect(c.retryable).toBe(true);
      expect(c.code).toBe("TRANSCODE_FAILED");
    }
  });
  test("resource hints map to quota", () => {
    const c = classifyFfmpegExit(1, "... out of memory ...");
    expect(c.code).toBe("QUOTA_EXCEEDED");
    expect(c.retryable).toBe(true);
  });
  test("input hints map to unsupported media", () => {
    const c = classifyFfmpegExit(1, "Invalid data found when processing input");
    expect(c.code).toBe("UNSUPPORTED_MEDIA");
    expect(c.retryable).toBe(false);
  });
  test("generic failure is non-retryable transcode failure", () => {
    const c = classifyFfmpegExit(1, "some other boom");
    expect(c).toMatchObject({ code: "TRANSCODE_FAILED", retryable: false });
  });
});
