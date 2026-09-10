// Pre-upload settings validation against @repo/contracts schemas.
//
// Runs the exact same zod schemas the API enforces, so malformed export
// settings fail fast in the UI instead of burning upload bytes first.
// Each assert* throws an Error carrying the per-field issues; callers let it
// bubble into their existing try/catch → toast path. Editors go through the
// `validateSettings` singleton below.
import {
  cutSettingsSchema,
  genericSettingsSchema,
  mobileSettingsSchema,
  parseSettingsJson,
  type CutSettings,
  type GenericSettings,
  type MobileSettings,
} from "@repo/contracts";

/**
 * Singleton service owning every pre-upload settings check: one assert per
 * contracts schema (generic / mobile / cut), all funnelling parse failures
 * through the shared issue-shaping error builder. Stateless — the singleton
 * exists so call sites read uniformly (`validateSettings.assertCut(...)`)
 * alongside the other `lib/` services.
 */
class ValidateSettings {
  /** Max per-field issue lines folded into a validation error message. */
  private static readonly MAX_ISSUE_LINES = 8;

  // ------------------------------------------------------------------ public

  /**
   * Validate generic (crop-editor) export settings JSON against
   * `genericSettingsSchema`. Returns the parsed settings; throws an `Error`
   * with per-field reasons when the payload fails the contract.
   */
  assertGeneric(settingsJson: string): GenericSettings {
    const parsed = parseSettingsJson(settingsJson, genericSettingsSchema);
    if (!parsed.ok) {
      throw ValidateSettings.toError("Invalid export settings", parsed.issues);
    }
    return parsed.data;
  }

  /**
   * Validate mobile-editor export settings JSON against
   * `mobileSettingsSchema`. Returns the parsed settings; throws an `Error`
   * with per-field reasons when the payload fails the contract.
   */
  assertMobile(settingsJson: string): MobileSettings {
    const parsed = parseSettingsJson(settingsJson, mobileSettingsSchema);
    if (!parsed.ok) {
      throw ValidateSettings.toError("Invalid mobile settings", parsed.issues);
    }
    return parsed.data;
  }

  /**
   * Validate cut-editor export settings JSON against `cutSettingsSchema`.
   * Returns the parsed settings; throws an `Error` with per-field reasons
   * when the payload fails the contract.
   */
  assertCut(settingsJson: string): CutSettings {
    const parsed = parseSettingsJson(settingsJson, cutSettingsSchema);
    if (!parsed.ok) {
      throw ValidateSettings.toError("Invalid cut settings", parsed.issues);
    }
    return parsed.data;
  }

  // ----------------------------------------------------------------- private

  /**
   * Shape a contracts `issues[]` list into a single multi-line `Error`:
   * headline plus up to `MAX_ISSUE_LINES` bulleted per-field reasons.
   */
  private static toError(label: string, issues: string[]): Error {
    const details = issues
      .slice(0, ValidateSettings.MAX_ISSUE_LINES)
      .map((i) => `- ${i}`);
    return new Error(
      details.length > 0 ? `${label}:\n${details.join("\n")}` : label,
    );
  }
}

/** App-wide singleton — editors validate through this service. */
export const validateSettings = new ValidateSettings();
