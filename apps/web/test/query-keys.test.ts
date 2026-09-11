import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/lib/query-keys";

describe("queryKeys", () => {
  test("uses single literals per key (rename-safe)", () => {
    expect(queryKeys.adminJobs).toEqual(["admin-jobs"]);
    expect(queryKeys.storageStats).toEqual(["storage-stats"]);
    expect(queryKeys.uploadSessions).toEqual(["upload-sessions"]);
    expect(queryKeys.health).toEqual(["health"]);
  });

  test("builds a stable audio-analysis key from file identity", () => {
    const file = { name: "a.mp4", size: 10, lastModified: 5 };
    expect(queryKeys.audioAnalysis(file, 0)).toEqual([
      "audio-analysis",
      "a.mp4",
      10,
      5,
      0,
    ]);
    expect(queryKeys.audioAnalysis(file, 1)[4]).toBe(1);
  });
});
