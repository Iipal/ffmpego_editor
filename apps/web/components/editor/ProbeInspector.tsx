"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { FFprobeReport } from "@repo/types";

type Row = Record<string, unknown>;

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-kumo-line bg-kumo-recessed p-3 text-xs text-kumo-subtle">
      {children}
    </p>
  );
}

interface Column {
  key: string;
  label: string;
  render?: (row: Row, index: number) => string;
}

function PagedTable({
  rows,
  columns,
  pageSize = 50,
}: {
  rows: Row[];
  columns: Column[];
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  // New report (or filter) → back to the first page.
  useEffect(() => setPage(0), [rows]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );
  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-md border border-kumo-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-kumo-recessed text-left text-kumo-subtle">
              <th className="px-2 py-1 font-medium">#</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const n = safePage * pageSize + i;
              return (
                <tr key={n} className="border-t border-kumo-line">
                  <td className="px-2 py-1 text-kumo-subtle">{n}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="px-2 py-1 font-mono">
                      {c.render ? c.render(row, n) : fmt(row[c.key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-kumo-subtle">
          <span>
            Page {safePage + 1} of {pageCount} ({rows.length} rows)
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const STREAM_COLUMNS: Column[] = [
  { key: "index", label: "Stream" },
  { key: "codec_type", label: "Type" },
  { key: "codec_name", label: "Codec" },
  {
    key: "resolution",
    label: "Resolution / Audio",
    render: (row) =>
      row.codec_type === "video"
        ? `${fmt(row.width)}×${fmt(row.height)}`
        : `${fmt(row.sample_rate)} Hz · ${fmt(row.channels)} ch`,
  },
  { key: "pix_fmt", label: "Pix fmt" },
  { key: "avg_frame_rate", label: "FPS" },
  { key: "duration", label: "Duration" },
  { key: "bit_rate", label: "Bitrate" },
];

const FRAME_COLUMNS: Column[] = [
  { key: "stream_index", label: "Stream" },
  { key: "pict_type", label: "Type" },
  {
    key: "pkt_pts_time",
    label: "PTS time",
    // Merged packets_and_frames dumps don't always carry pkt_pts_time.
    render: (row) => fmt(row.pkt_pts_time ?? row.best_effort_timestamp_time),
  },
  { key: "pkt_size", label: "Size" },
  { key: "key_frame", label: "Key" },
  {
    key: "coded",
    label: "Coded WxH",
    render: (row) => `${fmt(row.width)}×${fmt(row.height)}`,
  },
];

const PACKET_COLUMNS: Column[] = [
  { key: "stream_index", label: "Stream" },
  { key: "pts_time", label: "PTS time" },
  { key: "dts_time", label: "DTS time" },
  { key: "size", label: "Size" },
  { key: "flags", label: "Flags" },
];

export function ProbeInspector({
  report,
  deepProbe,
}: {
  report: FFprobeReport;
  deepProbe: boolean;
}) {
  const streams = useMemo(() => report.streams ?? [], [report]);
  const frames = useMemo(() => report.frames ?? [], [report]);
  const packets = useMemo(() => report.packets ?? [], [report]);
  const formatEntries = useMemo(
    () => Object.entries(report.format ?? {}),
    [report],
  );
  const frameTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of frames) {
      const t = typeof f.pict_type === "string" ? f.pict_type : "?";
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].map(([t, n]) => `${t}: ${n}`).join(" · ");
  }, [frames]);

  return (
    <Tabs defaultValue="streams" className="min-h-0 flex-1 gap-3">
      <TabsList>
        <TabsTrigger value="streams">
          Streams{streams.length ? ` (${streams.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="format">Format</TabsTrigger>
        <TabsTrigger value="frames">
          Frames{frames.length ? ` (${frames.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="packets">
          Packets{packets.length ? ` (${packets.length})` : ""}
        </TabsTrigger>
        <TabsTrigger value="raw">Raw JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="streams" className="min-h-0 overflow-auto">
        {streams.length ? (
          <PagedTable rows={streams} columns={STREAM_COLUMNS} pageSize={10} />
        ) : (
          <EmptyNote>No stream data in this report.</EmptyNote>
        )}
      </TabsContent>
      <TabsContent value="format" className="min-h-0 overflow-auto">
        {formatEntries.length ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-kumo-line p-3 text-xs">
            {formatEntries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-kumo-subtle">{k}</dt>
                <dd className="font-mono break-all">{fmt(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyNote>No format data in this report.</EmptyNote>
        )}
      </TabsContent>
      <TabsContent value="frames" className="min-h-0 space-y-2 overflow-auto">
        {frames.length ? (
          <>
            <p className="text-xs text-kumo-subtle">
              {frames.length} frames ({frameTypes})
            </p>
            <PagedTable rows={frames} columns={FRAME_COLUMNS} />
          </>
        ) : (
          <EmptyNote>
            {deepProbe
              ? "This report contains no frame data."
              : "Frame data was not requested — enable Deep probe and fetch again."}
          </EmptyNote>
        )}
      </TabsContent>
      <TabsContent value="packets" className="min-h-0 space-y-2 overflow-auto">
        {packets.length ? (
          <>
            <p className="text-xs text-kumo-subtle">{packets.length} packets</p>
            <PagedTable rows={packets} columns={PACKET_COLUMNS} />
          </>
        ) : (
          <EmptyNote>
            {deepProbe
              ? "This report contains no packet data."
              : "Packet data was not requested — enable Deep probe and fetch again."}
          </EmptyNote>
        )}
      </TabsContent>
      <TabsContent value="raw" className="min-h-0 overflow-auto">
        <pre className="rounded-md border border-kumo-line bg-kumo-recessed p-3 text-xs leading-5 whitespace-pre-wrap break-all">
          <code>{JSON.stringify(report, null, 2)}</code>
        </pre>
      </TabsContent>
    </Tabs>
  );
}
