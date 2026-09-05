"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Subtitle, SubtitleTemplate } from "@/lib/subtitles/subtitleTypes";
import { generateId } from "./subtitle-helpers";
import { getCachedTemplates, setCachedTemplates } from "./template-cache";

export type UseSubtitleTemplatesArgs = {
  selectedId: string | null;
  selectedSubtitle: Subtitle | null;
  setSubtitles: (
    updater: Subtitle[] | ((prev: Subtitle[]) => Subtitle[]),
  ) => void;
};

// Style templates: lazy localStorage load, idle-persisted saves, apply/save.
export function useSubtitleTemplates({
  selectedId,
  selectedSubtitle,
  setSubtitles,
}: UseSubtitleTemplatesArgs) {
  const [, startTransition] = useTransition();

  // rerender-lazy-state-init: expensive localStorage read only once
  const [templates, setTemplates] = useState<SubtitleTemplate[]>(() =>
    getCachedTemplates(),
  );
  const [newTemplateName, setNewTemplateName] = useState("");

  // templates persistence — split from load (rerender-split-combined-hooks) + js-cache-storage + idle-callback
  useEffect(() => {
    setCachedTemplates(templates);
  }, [templates]);

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (!selectedId) return;
      const tmpl = templates.find((t) => t.id === templateId);
      if (!tmpl) return;
      const sid = selectedId;
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) =>
            s.id === sid ? { ...s, style: { ...tmpl.style } } : s,
          ),
        );
      });
    },
    [selectedId, templates, setSubtitles],
  );

  const handleSaveTemplate = useCallback(() => {
    if (!selectedSubtitle) return;
    const name = newTemplateName.trim();
    if (!name) return;
    const newTmpl: SubtitleTemplate = {
      id: generateId(),
      name,
      style: { ...selectedSubtitle.style },
    };
    setTemplates((prev) => [...prev, newTmpl]);
    setNewTemplateName("");
  }, [selectedSubtitle, newTemplateName]);

  return {
    templates,
    newTemplateName,
    setNewTemplateName,
    handleApplyTemplate,
    handleSaveTemplate,
  };
}
