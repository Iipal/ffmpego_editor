"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOptimistic, useTransition, ViewTransition } from "react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const NAV_ITEMS: NavItem[] = [
  {
    href: "/editor/crop",
    label: "Crop",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
  {
    href: "/editor/mobile",
    label: "Mobile",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <line x1="9" y1="7" x2="15" y2="7" />
      </svg>
    ),
  },
  {
    href: "/editor/mobile/subtitles",
    label: "Subtitles",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <line x1="6" y1="10" x2="18" y2="10" />
        <line x1="8" y1="14" x2="16" y2="14" />
      </svg>
    ),
  },
  {
    href: "/editor/mobile/bulk",
    label: "Bulk",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/editor/cut",
    label: "Cut",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="8.5" y1="8" x2="20" y2="20" />
        <line x1="8.5" y1="16" x2="20" y2="4" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 20a8 8 0 0 0 8-8 8 8 0 0 0-8-8 8 8 0 0 0-8 8 8 8 0 0 0 8 8Z" />
        <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </svg>
    ),
  },
];

// Navigation order for directional slides: crop (0) -> mobile (1) -> subtitles (2) -> bulk (3) -> cut (4) -> admin (5)
const ORDER: Record<string, number> = {
  "/editor/crop": 0,
  "/editor/mobile": 1,
  "/editor/mobile/subtitles": 2,
  "/editor/mobile/bulk": 3,
  "/editor/cut": 4,
  "/admin": 5,
};

function navType(from: string, to: string): "nav-forward" | "nav-back" {
  const a = ORDER[from] ?? 99;
  const b = ORDER[to] ?? 99;
  return b > a ? "nav-forward" : "nav-back";
}

export function AppNav() {
  const pathname = usePathname();
  const active =
    [...NAV_ITEMS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      ?.href ?? "/editor/crop";
  const [optimisticActive, setOptimisticActive] = useOptimistic(active);
  const [, startTransition] = useTransition();

  return (
    <nav
      role="tablist"
      aria-label="Editor mode"
      className={cn(
        "relative inline-flex items-center gap-1 p-1 rounded-lg",
        "bg-kumo-recessed border border-kumo-line w-full sm:w-auto shadow-sm",
      )}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.href;
        const isOptimistic = optimisticActive === item.href;
        const type = navType(active, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            // transitionTypes: Next 16.2+ ; graceful fallback via manual if not supported
            transitionTypes={[type] as unknown as never}
            scroll={false}
            role="tab"
            aria-selected={isOptimistic}
            aria-current={isOptimistic ? "page" : undefined}
            onNavigate={() =>
              startTransition(() => setOptimisticActive(item.href))
            }
            className={cn(
              "relative z-1 flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus",
              isOptimistic
                ? "text-kumo-strong"
                : "text-kumo-subtle hover:text-kumo-default",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {isActive ? (
              <ViewTransition
                name="tab-indicator"
                share="tab-underline"
                default="none"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-md bg-kumo-base border border-kumo-line shadow-sm"
                />
              </ViewTransition>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
