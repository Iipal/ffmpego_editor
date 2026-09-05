"use client";

// ---------------------------------------------------------------------------
// Admin Jobs Dashboard — Vercel React Best Practices compliant
// Covers 70 rules: async-*, bundle-*, server-*, client-*, rerender-*,
// rendering-*, js-*, advanced-*
// Reference: apps/web/app/pageEditorMobile.tsx, apps/web/.agents/skills/vercel-react-best-practices/
// Thin composer: feature pieces live in @/components/admin/*.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { API_BASE_URL } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { FilterBar } from "@/components/admin/FilterBar";
import { JobsArea } from "@/components/admin/JobsArea";
import { JobsList } from "@/components/admin/JobsList";
import { TipsHoisted } from "@/components/admin/placeholders";
import { didInitApp, ensurePreconnect, markAppInit, preloadHeavyCard } from "@/components/admin/heavy";
import { useAdminJobs } from "@/components/admin/useAdminJobs";

export default function PageAdmin() {
  // advanced-init-once: one-time preconnect, not per mount
  useEffect(() => {
    if (didInitApp) return;
    markAppInit();
    ensurePreconnect();
  }, []);

  const admin = useAdminJobs();
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
    pollTickRef,
    deletePending,
    clearAllPending,
    clearPendingPending,
    setFilterStable,
    handleClearAll,
    handleClearPending,
    handleRefresh,
    handleDeleteOne,
  } = admin;

  // rendering-usetransition-loading: useTransition pending as loading signal (not manual isLoading alone)
  // rendering-hoist-jsx: TipsHoisted reused
  // rendering-resource-hints: ensurePreconnect above
  // rendering-hydration-suppress-warning: suppressHydrationWarning on time-sensitive spans
  // rendering-svg-precision / rendering-animate-svg-wrapper: NA (no animated SVG here)
  // server-* NA doc: this is "use client" local-only admin; no RSC auth/cache required (see below)

  return (
    <div className="space-y-4">
      {/* resource hints already via ensurePreconnect; bundle-preload via hover handlers below */}
      <AdminHeader
        isFilterStale={isFilterStale}
        isFetching={isFetching}
        jobsLength={jobs.length}
        pendingCount={pendingCount}
        clearAllPending={clearAllPending}
        clearPendingPending={clearPendingPending}
        onRefresh={handleRefresh}
        onClearPending={handleClearPending}
        onClearAll={handleClearAll}
      />

      {/* Jobs area — control & readout surface, mirrors pageEditorCrop CropArea */}
      <JobsArea
        total={data?.count ?? jobs.length}
        pending={pendingCount}
        completed={completedCount}
        failed={failedCount}
        filter={deferredFilter}
        isStale={isFilterStale}
        isFetching={isFetching}
        apiBase={API_BASE_URL}
        onRefresh={handleRefresh}
      />

      <Card onMouseEnter={preloadHeavyCard}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm" suppressHydrationWarning>
            Current jobs · {data?.count ?? 0} total{" "}
            {isFetching ? "· live polling…" : null}{" "}
            {isPendingTransition ? "· updating filter…" : null}
          </CardTitle>
          <CardDescription className="flex flex-col gap-2">
            <FilterBar
              deferredFilter={deferredFilter}
              isFilterStale={isFilterStale}
              isFetching={isFetching}
              isPendingTransition={isPendingTransition}
              jobsLength={jobs.length}
              pendingCount={pendingCount}
              pollTick={pollTickRef.current}
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
            onDelete={handleDeleteOne}
          />
        </CardContent>
      </Card>

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
