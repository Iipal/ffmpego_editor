/**
 * Versioned render plans. A plan wraps kind + settings so old payloads can
 * be migrated (or explicitly rejected) instead of failing opaque validation.
 *
 * - v0: legacy bare settings object (no version/kind wrapper) — what every
 *   current client sends in the multipart `settings` field.
 * - v1: `{ version: 1, kind, settings }` wrapper (current).
 */
import { z } from "zod";
import {
  cutSettingsSchema,
  genericSettingsSchema,
  mobileSettingsSchema,
} from "./settings";

export const PLAN_VERSION = 1 as const;

export const RENDER_KINDS = [
  "generic",
  "mobile",
  "mobile-subtitles",
  "cut",
] as const;
export type RenderKind = (typeof RENDER_KINDS)[number];

export const JOB_STATES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobState = (typeof JOB_STATES)[number];

const settingsByKind = {
  generic: genericSettingsSchema,
  mobile: mobileSettingsSchema,
  "mobile-subtitles": mobileSettingsSchema,
  cut: cutSettingsSchema,
} as const;

export const renderPlanSchema = z.discriminatedUnion("kind", [
  z.object({
    version: z.literal(PLAN_VERSION),
    kind: z.literal("generic"),
    settings: genericSettingsSchema,
  }),
  z.object({
    version: z.literal(PLAN_VERSION),
    kind: z.literal("mobile"),
    settings: mobileSettingsSchema,
  }),
  z.object({
    version: z.literal(PLAN_VERSION),
    kind: z.literal("mobile-subtitles"),
    settings: mobileSettingsSchema,
  }),
  z.object({
    version: z.literal(PLAN_VERSION),
    kind: z.literal("cut"),
    settings: cutSettingsSchema,
  }),
]);

export type RenderPlan = z.infer<typeof renderPlanSchema>;

export type PlanMigration =
  | { ok: true; plan: RenderPlan }
  | { ok: false; issues: string[]; reason: "invalid" | "unsupported-version" };

/** Detect the render kind of a legacy (v0) bare settings object. */
export function detectLegacyKind(
  raw: Record<string, unknown>,
): RenderKind | null {
  if (Array.isArray(raw.cuts)) return "cut";
  if (raw.mobileLayout && typeof raw.mobileLayout === "object") return "mobile";
  if (typeof raw.exportFormat === "string") return "generic";
  return null;
}

/**
 * Migrate any supported plan payload to the current version.
 * v0 (bare settings) is wrapped by kind detection; unknown versions and
 * undetectable kinds are rejected explicitly with actionable issues.
 */
export function migrateRenderPlan(
  raw: unknown,
  defaultKind: RenderKind = "generic",
): PlanMigration {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      issues: ["plan: must be a JSON object"],
      reason: "invalid",
    };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version === undefined) {
    const kind = detectLegacyKind(obj) ?? defaultKind;
    const schema = settingsByKind[kind];
    const parsed = schema.safeParse(obj);
    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid",
        issues: parsed.error.issues.map((i) => {
          const at = i.path.length ? `${String(i.path.join("."))}: ` : "";
          return `settings.${at}${i.message}`;
        }),
      };
    }
    return {
      ok: true,
      plan: {
        version: PLAN_VERSION,
        kind,
        settings: parsed.data,
      } as RenderPlan,
    };
  }
  if (obj.version !== PLAN_VERSION) {
    return {
      ok: false,
      reason: "unsupported-version",
      issues: [
        `plan version ${JSON.stringify(obj.version)} is not supported (current: ${PLAN_VERSION}). Re-export the plan from the editor.`,
      ],
    };
  }
  const parsed = renderPlanSchema.safeParse(obj);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: parsed.error.issues.map((i) => {
        const at = i.path.length ? `${String(i.path.join("."))}: ` : "";
        return `${at}${i.message}`;
      }),
    };
  }
  return { ok: true, plan: parsed.data };
}
