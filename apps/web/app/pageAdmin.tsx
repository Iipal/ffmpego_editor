"use client";

// ---------------------------------------------------------------------------
// Admin Jobs Dashboard — Vercel React Best Practices compliant
// Covers 70 rules: async-*, bundle-*, server-*, client-*, rerender-*,
// rendering-*, js-*, advanced-*
// Reference: apps/web/app/pageEditorMobile.tsx, apps/web/.agents/skills/vercel-react-best-practices/
// Thin composer: feature pieces live in @/components/admin/*.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { videoFileService } from "@/lib/video-file";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ExtractRows } from "@/components/admin/ExtractRows";
import { FilterBar } from "@/components/admin/FilterBar";
import { JobsArea } from "@/components/admin/JobsArea";
import { JobsList } from "@/components/admin/JobsList";
import { StorageArea } from "@/components/admin/StorageArea";
import { UploadSessions } from "@/components/admin/UploadSessions";
import { TipsHoisted } from "@/components/admin/placeholders";
import {
  didInitApp,
  ensurePreconnect,
  markAppInit,
  preloadHeavyCard,
} from "@/components/admin/heavy";
import { useAdminJobs } from "@/components/admin/useAdminJobs";
import { useHealthQuery } from "@/hooks/useHealth";
import {
  useStorageStatsQuery,
  useStorageSweepMutation,
} from "@/hooks/useStorageStats";
import {
  useAbortUploadSessionMutation,
  useUploadSessionsQuery,
} from "@/hooks/useUploadSessions";

export default function PageAdmin() {
  // advanced-init-once: one-time preconnect, not per mount
  useEffect(() => {
    if (didInitApp) return;
    markAppInit();
    ensurePreconnect();
  }, []);

  const admin = useAdminJobs();
  const {
    data: health,
    isLoading: healthLoading,
    error: healthError,
  } = useHealthQuery();
  const {
    data: storage,
    isLoading: storageLoading,
    error: storageError,
  } = useStorageStatsQuery();
  const { mutate: sweepStorage, isPending: sweepPending } =
    useStorageSweepMutation();
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useUploadSessionsQuery();
  const {
    mutate: abortSession,
    isPending: abortPending,
    variables: abortingId,
  } = useAbortUploadSessionMutation();

  const handleAbortSession = (uploadId: string) => {
    abortSession(uploadId, {
      onSuccess: () => {
        toast.success("Upload session aborted — bytes released");
      },
      onError: (e) => {
        toast.error(
          e instanceof Error ? e.message : "Abort failed — try again.",
        );
      },
    });
  };

  const handleSweep = () => {
    sweepStorage(undefined, {
      onSuccess: (r) => {
        const freed = videoFileService.formatFileSize(r.bytesFreed);
        const reaped = r.expired + r.staleReserved + r.missing + r.orphans;
        toast.success(
          reaped > 0
            ? `Sweep freed ${freed} (${reaped} record${reaped === 1 ? "" : "s"})`
            : "Sweep complete — nothing to free",
        );
      },
      onError: (e) => {
        toast.error(
          e instanceof Error ? e.message : "Sweep failed — try again.",
        );
      },
    });
  };
  const {
    data,
    jobs,
    filtered,
    filter,
    deferredFilter,
    isFilterStale,
    isPendingTransition,
    isLoading,
    isError,
    error,
    isFetching,
    pendingCount,
    completedCount,
    failedCount,
    hasJobs,
    liveStatus,
    deletePending,
    cancelPending,
    clearAllPending,
    clearPendingPending,
    setFilterStable,
    handleClearAll,
    handleClearPending,
    handleRefresh,
    handleDeleteOne,
    handleCancelOne,
    handleDownloadOne,
    handleDownloadAlternateOne,
    handleCompareOne,
    handleCompareAlternateOne,
    handleRetryEntry,
    handleRenameOne,
    handleExtractRename,
    handleExtractDelete,
    entryById,
    extractEntries,
  } = admin;

  // rendering-usetransition-loading: useTransition pending as loading signal (not manual isLoading alone)
  // rendering-hoist-jsx: TipsHoisted reused
  // rendering-resource-hints: ensurePreconnect above
  // rendering-hydration-suppress-warning: suppressHydrationWarning on time-sensitive spans
  // rendering-svg-precision / rendering-animate-svg-wrapper: NA (no animated SVG here)
  // server-* NA doc: this is "use client" local-only admin; no RSC auth/cache required (see below)

  return (
    <div className="flex flex-col gap-3">
      {/* resource hints already via ensurePreconnect; bundle-preload via hover handlers below */}
      <AdminHeader
        isFetching={isFetching}
        jobsLength={jobs.length}
        pendingCount={pendingCount}
        clearAllPending={clearAllPending}
        clearPendingPending={clearPendingPending}
        health={health}
        healthLoading={healthLoading}
        healthError={healthError instanceof Error ? healthError.message : null}
        onRefresh={handleRefresh}
        onClearPending={handleClearPending}
        onClearAll={handleClearAll}
      />

      {/* Ops row — peer cards: jobs readout, storage/quota, upload sessions */}
      <div className="grid grid-cols-2 gap-3">
        {/* Jobs area — control & readout surface, mirrors pageEditorCrop CropArea */}
        <JobsArea
          total={data?.count ?? jobs.length}
          pending={pendingCount}
          completed={completedCount}
          failed={failedCount}
          filter={deferredFilter}
          isStale={isFilterStale}
          isFetching={isFetching}
          apiBase={apiClient.baseUrl}
          liveStatus={liveStatus}
          onRefresh={handleRefresh}
        />

        {/* Storage — quota census + on-demand sweep */}
        <StorageArea
          storage={storage}
          storageLoading={storageLoading}
          storageError={
            storageError instanceof Error ? storageError.message : null
          }
          sweepPending={sweepPending}
          onSweep={handleSweep}
        />

        {/* Upload sessions — interrupted chunked uploads + abort */}
        <UploadSessions
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          sessionsError={
            sessionsError instanceof Error ? sessionsError.message : null
          }
          abortPendingId={abortPending ? (abortingId ?? null) : null}
          onAbort={handleAbortSession}
        />
      </div>

      <Card onMouseEnter={preloadHeavyCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm" suppressHydrationWarning>
            Current jobs · {data?.count ?? 0} total{" "}
            {isPendingTransition ? "· updating filter…" : null}
          </CardTitle>
          <CardDescription className="flex flex-col gap-2">
            <FilterBar
              deferredFilter={deferredFilter}
              isFilterStale={isFilterStale}
              liveStatus={liveStatus}
              isPendingTransition={isPendingTransition}
              jobsLength={jobs.length}
              pendingCount={pendingCount}
              isError={isError}
              error={error as Error | null}
              onSelect={setFilterStable}
              onRefresh={handleRefresh}
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <JobsList
            isLoading={isLoading}
            filtered={filtered}
            filter={filter}
            deferredFilter={deferredFilter}
            isFilterStale={isFilterStale}
            hasJobs={hasJobs}
            deletePending={deletePending}
            cancelPending={cancelPending}
            entryById={entryById}
            onDelete={handleDeleteOne}
            onCancel={handleCancelOne}
            onDownload={handleDownloadOne}
            onCompare={handleCompareOne}
            onDownloadAlternate={handleDownloadAlternateOne}
            onCompareAlternate={handleCompareAlternateOne}
            onRetry={handleRetryEntry}
            onRename={handleRenameOne}
          />
        </CardContent>
      </Card>

      {extractEntries.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Audio extracts · {extractEntries.length} local
            </CardTitle>
            <CardDescription>
              Audio-only pulls have no server job — the bytes were downloaded
              when created. Retry re-runs the pull against the current source
              file. These records live in this browser only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExtractRows
              entries={extractEntries}
              onRetry={handleRetryEntry}
              onRename={handleExtractRename}
              onDelete={handleExtractDelete}
            />
          </CardContent>
        </Card>
      ) : null}

      {TipsHoisted}

      {/* server-* rules NA documentation — client-only page, no RSC/SSR auth/caching needed
          server-auth-actions, server-cache-react, server-cache-lru, server-dedup-props,
          server-hoist-static-io, server-no-shared-module-state, server-serialization,
          server-parallel-fetching, server-parallel-nested-fetching, server-after-nonblocking:
          all server-only — not applicable to this client-only admin dashboard (local-only,
          no auth/RSC, Hono on Bun). Static hoisting already via ensurePreconnect + HEAVY_MODULES.
          rendering-hydration-no-flicker / rendering-script-defer-async / rendering-svg-precision /
          rendering-animate-svg-wrapper: NA (no SSR theme script, no animated SVG, no <script>).
          async-suspense-boundaries: NA for polling page (SWR via useQuery); Suspense would be via
          <Suspense> wrapper if RSC were used.
          bundle-barrel-imports satisfied via direct ui/* imports; bundle-defer-third-party via
          requestIdleCallback for toast/storage.
      */}
    </div>
  );
}
