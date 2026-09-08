// Pre-upload settings validation against @repo/contracts schemas.
// Runs the exact same zod schemas the API enforces, so malformed export
// settings fail fast in the UI instead of burning upload bytes first.
// Each assert* throws an Error carrying the per-field issues; callers let it
// bubble into their existing try/catch → toast path.

import {
  cutSettingsSchema,
  genericSettingsSchema,
  mobileSettingsSchema,
  parseSettingsJson,
  type CutSettings,
  type GenericSettings,
  type MobileSettings,
} from "@repo/contracts";

function toError(label: string, issues: string[]): Error {
  const details = issues.slice(0, 8).map((i) => `- ${i}`);
  return new Error(
    details.length > 0 ? `${label}:\n${details.join("\n")}` : label,
  );
}

export function assertGenericSettings(settingsJson: string): GenericSettings {
  const parsed = parseSettingsJson(settingsJson, genericSettingsSchema);
  if (!parsed.ok) throw toError("Invalid export settings", parsed.issues);
  return parsed.data;
}

export function assertMobileSettings(settingsJson: string): MobileSettings {
  const parsed = parseSettingsJson(settingsJson, mobileSettingsSchema);
  if (!parsed.ok) throw toError("Invalid mobile settings", parsed.issues);
  return parsed.data;
}

export function assertCutSettings(settingsJson: string): CutSettings {
  const parsed = parseSettingsJson(settingsJson, cutSettingsSchema);
  if (!parsed.ok) throw toError("Invalid cut settings", parsed.issues);
  return parsed.data;
}
