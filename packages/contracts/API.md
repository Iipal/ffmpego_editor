# @repo/contracts — shared API contracts

Framework-free (no Hono/Next imports). Both `apps/api` and `apps/web` depend
on this package, so validation, error codes, and field names stay in sync by
construction.

## Error envelope

Every API error response uses exactly this shape:

```jsonc
{
  "code": "VALIDATION_FAILED", // ErrorCode — programmatic handling
  "message": "Invalid export settings", // human-readable headline
  "issues": ["trimRange: ..."], // optional — per-field reasons (400s)
  "requestId": "abc-123", // log correlation (honors `x-request-id`)
  "jobId": "…", // only when the error belongs to a job
  "details": { "neededBytes": 1, "quotaBytes": 2 }, // machine-readable extras
}
```

Envelopes never carry filesystem paths.

HTTP status comes from `ERROR_STATUS` (single source of truth). Notable
mappings: `QUEUE_FULL → 429` (+ `Retry-After` header), `QUOTA_EXCEEDED /
DISK_FULL → 507`, `UNSUPPORTED_MEDIA / FFPROBE_FAILED / NO_AUDIO_TRACK /
AUDIO_FAILED → 422`, `RANGE_INVALID → 416` (+ `Content-Range` header),
`TRANSCODE_CANCELLED → 499`.

Example — client handling:

```ts
import { ERROR_STATUS } from "@repo/contracts";

const res = await fetch("/api/transcode", { method: "POST", body: form });
if (!res.ok) {
  const env = await res.json(); // ErrorEnvelope
  if (env.code === "QUEUE_FULL") scheduleRetry(res.headers.get("Retry-After"));
  else toast.error(env.message, { description: env.issues?.join("\n") });
}
```

## FFmpeg exit classification

`classifyFfmpegExit(exitCode, logTail)` maps process results to the same
error vocabulary so SSE terminal states and API errors agree:

| Input                                      | `code`                                  | `retryable`   |
| ------------------------------------------ | --------------------------------------- | ------------- |
| `0`                                        | `TRANSCODE_FAILED` ("reported success") | no            |
| `137` / `143` (SIGKILL/SIGTERM, often OOM) | `TRANSCODE_FAILED`                      | **yes**       |
| stderr matches `out of memory              | cannot allocate                         | no space left | disk quota` | `QUOTA_EXCEEDED`    | **yes** |
| stderr matches `invalid data               | no such file                            | unsupported   | …`          | `UNSUPPORTED_MEDIA` | no      |
| anything else non-zero                     | `TRANSCODE_FAILED`                      | no            |

## Settings schemas

`genericSettingsSchema` (`POST /api/transcode`), `mobileSettingsSchema`
(`POST /api/transcode/mobile`, `/mobile/subtitles`), `cutSettingsSchema`
(`POST /api/transcode/cut`). The web app validates with
`parseSettingsJson(settingsJson, <schema>)` **before upload** via
`apps/web/lib/validate-settings.ts`, so malformed settings fail fast instead
of burning upload bytes.

```ts
import { parseSettingsJson, mobileSettingsSchema } from "@repo/contracts";

const parsed = parseSettingsJson(settingsJson, mobileSettingsSchema);
if (!parsed.ok) throw new Error(parsed.issues.join("\n")); // "path: message"
```

## Versioned render plans

`PLAN_VERSION = 1`. A plan is `{ version, kind, settings }` where `kind` is
one of `generic | mobile | mobile-subtitles | cut` (`RenderKind`).

`migrateRenderPlan(raw, defaultKind?)` accepts:

- **v0** — legacy bare settings object (what current clients send): kind is
  detected (`cuts` → `cut`, `mobileLayout` → `mobile`, `exportFormat` →
  `generic`, else `defaultKind`), wrapped, and validated.
- **v1** — `{ version: 1, kind, settings }`: validated directly.

Anything else is rejected explicitly:

```ts
const r = migrateRenderPlan(JSON.parse(settingsField), "generic");
if (!r.ok) {
  // r.reason: "invalid" | "unsupported-version", r.issues: string[]
}
```

Unknown future versions yield `unsupported-version` ("Re-export the plan from
the editor") instead of an opaque validation failure. The API maps that
reason to `PLAN_VERSION_UNSUPPORTED`; every other failure becomes
`VALIDATION_FAILED` with `issues`.

## Multipart fields

Read/write with `MULTIPART_FIELDS` (`settings`, `file`, `uploadId`,
`subtitles` + `subtitlesMeta`/`subtitles_meta` aliases,
`subtitleFilePrefix: "subtitle"` for `subtitle_0…` PNGs). The chunked-upload
session id travels via `UPLOAD_ID_HEADER` (`x-upload-id`, preferred) or
`UPLOAD_ID_QUERY` (`?uploadId=`), falling back to the `uploadId` form field.
Request correlation uses `REQUEST_ID_HEADER` (`x-request-id`).
