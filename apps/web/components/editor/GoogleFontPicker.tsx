"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  ensureGoogleFontLoaded,
  fetchGoogleFontsMeta,
  isCyrillicSupported,
} from "@/lib/subtitles/googleFonts";
import { FONT_FAMILY_OPTIONS } from "@/lib/subtitles/subtitleDefaults";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface GoogleFontPickerProps {
  value: string;
  onValueChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  previewText?: string;
}

function displayName(family: string): string {
  return family
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
}

export function GoogleFontPicker({
  value,
  onValueChange,
  id,
  placeholder = "Search font…",
  previewText,
}: GoogleFontPickerProps) {
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cyrillicOnly, setCyrillicOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchGoogleFontsMeta()
      .then((metas) => {
        if (cancelled) return;
        const families = metas.map((m) => m.family);
        const systemDisplay = new Set(
          FONT_FAMILY_OPTIONS.map((f) => displayName(f).toLowerCase()),
        );
        const googleUnique = families.filter(
          (f) => !systemDisplay.has(displayName(f).toLowerCase()),
        );
        const merged = [...FONT_FAMILY_OPTIONS, ...googleUnique];
        setFonts(merged);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load fonts");
        setFonts([...FONT_FAMILY_OPTIONS]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ensure selected font is loaded for preview
  useEffect(() => {
    if (value) ensureGoogleFontLoaded(value).catch(() => {});
  }, [value]);

  // reset query when closing to show initial 25 again
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selectedDisplay = displayName(value);

  const previewTrimmed = useMemo(() => {
    const t = previewText?.trim();
    if (!t) return "";
    // limit to 40 chars for preview, keep cyrillic glyphs intact
    return t.length > 40 ? t.slice(0, 40) + "…" : t;
  }, [previewText]);

  const filteredFonts = useMemo(() => {
    if (loading) return [] as string[];
    const q = query.trim().toLowerCase();
    const out: string[] = [];
    for (const f of fonts) {
      if (cyrillicOnly && !isCyrillicSupported(f)) continue;
      if (q && !f.toLowerCase().includes(q)) continue;
      out.push(f);
      if (out.length >= 25) break;
    }
    return out;
  }, [fonts, query, loading, cyrillicOnly]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-label="Font Family"
            id={id}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span
          className="flex-1 truncate text-left"
          style={{ fontFamily: value }}
        >
          {selectedDisplay || "Select font"}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="p-2 border-b space-y-2">
            <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-ring">
              <Search className="size-4 shrink-0 opacity-40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-kumo-subtle"
                autoFocus={open}
                aria-label="Search font"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-xs text-kumo-subtle hover:text-foreground"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="cyrillic-toggle"
                className="text-xs font-normal flex items-center gap-1.5 cursor-pointer"
              >
                Cyrillic only
                <span className="text-[11px] text-kumo-subtle">
                  (
                  {cyrillicOnly
                    ? filteredFonts.length
                    : fonts.filter((f) => isCyrillicSupported(f)).length}{" "}
                  з підтримкою)
                </span>
              </Label>
              <Switch
                id="cyrillic-toggle"
                checked={cyrillicOnly}
                onCheckedChange={setCyrillicOnly}
                aria-label="Filter Cyrillic-supported fonts"
              />
            </div>
            {previewTrimmed && (
              <p
                className="text-[11px] text-kumo-subtle truncate"
                title={previewTrimmed}
              >
                Preview: “{previewTrimmed}”
              </p>
            )}
            <p className="text-[11px] text-kumo-subtle">
              {loading
                ? "Fetching…"
                : query || cyrillicOnly
                  ? `Showing ${filteredFonts.length} / ${fonts.length}`
                  : `Showing 25 / ${fonts.length} • type to search`}
            </p>
          </div>
          <CommandList>
            <CommandEmpty>
              {loading
                ? "Loading fonts…"
                : error
                  ? error
                  : query
                    ? `No match for “${query}”`
                    : "No font found."}
            </CommandEmpty>
            <CommandGroup>
              {loading ? (
                <div className="py-6 text-center text-sm text-kumo-subtle">
                  Loading Google Fonts…
                </div>
              ) : filteredFonts.length === 0 ? (
                <div className="py-6 text-center text-sm text-kumo-subtle">
                  No fonts match “{query}”
                </div>
              ) : (
                filteredFonts.map((f) => {
                  const name = displayName(f);
                  const isSelected = value === f || displayName(value) === name;
                  const supportsCy = isCyrillicSupported(f);
                  return (
                    <CommandItem
                      key={f}
                      value={f}
                      onSelect={async (currentValue: string) => {
                        try {
                          await ensureGoogleFontLoaded(currentValue);
                        } catch {}
                        onValueChange(currentValue);
                        setOpen(false);
                      }}
                      onMouseEnter={() => {
                        ensureGoogleFontLoaded(f).catch(() => {});
                      }}
                      className={cn(
                        "flex items-center gap-2 py-2",
                        isSelected && "bg-accent",
                      )}
                      data-checked={isSelected ? "true" : "false"}
                    >
                      <div className="flex flex-1 flex-col min-w-0">
                        <span
                          className="truncate text-sm leading-tight"
                          style={{ fontFamily: f }}
                          title={
                            previewTrimmed
                              ? `${previewTrimmed} (${name})`
                              : name
                          }
                        >
                          {previewTrimmed ? previewTrimmed : name}
                        </span>
                        {previewTrimmed ? (
                          <span className="truncate text-[11px] text-kumo-subtle flex gap-1">
                            <span>{name}</span>
                            <span className="hidden sm:inline">
                              • {f.includes(",") ? "System" : "Google"}
                            </span>
                            {supportsCy ? (
                              <span className="text-[10px] px-1 rounded bg-emerald-500/10 text-emerald-600 border">
                                Кир
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      {!previewTrimmed && (
                        <span className="text-[11px] text-kumo-subtle hidden sm:inline flex items-center gap-1">
                          {f.includes(",") ? "System" : "Google"}
                          {supportsCy && (
                            <span className="text-[10px] px-1 rounded bg-emerald-500/10 text-emerald-600 border">
                              Кир
                            </span>
                          )}
                        </span>
                      )}
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </CommandList>
          <div className="border-t px-3 py-2 text-[11px] text-kumo-subtle">
            {loading
              ? "Fetching…"
              : query
                ? `${filteredFonts.length} match${filteredFonts.length !== 1 ? "es" : ""} • capped to 25 • total ${fonts.length}`
                : `25 shown • search to find more • total ${fonts.length}`}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
