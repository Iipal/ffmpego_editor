"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabSwitcherProps {
  tabs: readonly Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const TabSwitcher: React.FC<TabSwitcherProps> = ({
  tabs,
  activeTab,
  onTabChange,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const activeIndex = tabs.findIndex((t) => t.id === activeTab);

  useEffect(() => {
    const el = tabRefs.current.get(activeTab);
    const list = listRef.current;
    if (!el || !list) return;
    const listRect = list.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    setIndicator({
      left: rect.left - listRect.left,
      width: rect.width,
    });
  }, [activeTab, tabs]);

  // Keep indicator in sync on resize
  useEffect(() => {
    const onResize = () => {
      const el = tabRefs.current.get(activeTab);
      const list = listRef.current;
      if (!el || !list) return;
      const listRect = list.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      setIndicator({ left: rect.left - listRect.left, width: rect.width });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeTab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (idx === -1) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const targetId = tabs[next].id;
    onTabChange(targetId);
    tabRefs.current.get(targetId)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Editor mode"
      onKeyDown={onKeyDown}
      className={cn(
        "relative inline-flex items-center gap-1 p-1 rounded-[var(--radius)]",
        "bg-muted border border-border",
        "w-full sm:w-auto sm:min-w-[280px]",
        "shadow-sm"
      )}
    >
      {/* sliding indicator */}
      <div
        aria-hidden
        className="absolute top-1 bottom-1 rounded-md bg-primary shadow-sm transition-all duration-200 ease-out"
        style={{
          left: indicator.left,
          width: indicator.width,
          opacity: indicator.width ? 1 : 0,
        }}
      />

      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
              else tabRefs.current.delete(tab.id);
            }}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative z-[1] flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-50",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon && (
              <span
                className={cn(
                  "shrink-0 transition-transform duration-200",
                  isActive ? "scale-105" : "opacity-80 group-hover:opacity-100"
                )}
                aria-hidden
              >
                {tab.icon}
              </span>
            )}
            <span className="tracking-[-0.01em]">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default TabSwitcher;
