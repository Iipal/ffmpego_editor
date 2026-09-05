"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOptimistic, useTransition, ViewTransition } from "react";
import {
  Captions,
  Crop,
  LayoutGrid,
  Scissors,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ReactNode };

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/editor/crop",
    label: "Crop",
    icon: <Crop className="w-4 h-4" />,
  },
  {
    href: "/editor/mobile",
    label: "Mobile",
    icon: <Smartphone className="w-4 h-4" />,
  },
  {
    href: "/editor/mobile/subtitles",
    label: "Subtitles",
    icon: <Captions className="w-4 h-4" />,
  },
  {
    href: "/editor/mobile/bulk",
    label: "Bulk",
    icon: <LayoutGrid className="w-4 h-4" />,
  },
  {
    href: "/editor/cut",
    label: "Cut",
    icon: <Scissors className="w-4 h-4" />,
  },
  {
    href: "/admin",
    label: "Admin",
    icon: <ShieldCheck className="w-4 h-4" />,
  },
];

const NAV_ITEMS_SORTED = [...NAV_ITEMS].sort(
  (a, b) => b.href.length - a.href.length,
);

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

export function AppNav({
  orientation = "horizontal",
  collapsed = false,
}: {
  orientation?: "horizontal" | "vertical";
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active =
    NAV_ITEMS_SORTED.find(
      (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
    )?.href ?? "/editor/crop";
  const [optimisticActive, setOptimisticActive] = useOptimistic(active);
  const [, startTransition] = useTransition();

  return (
    <nav
      role="tablist"
      aria-label="Editor mode"
      aria-orientation={orientation}
      className={cn(
        "relative inline-flex items-center gap-1 p-1 rounded-lg",
        "bg-kumo-recessed border border-kumo-line shadow-sm",
        orientation === "vertical"
          ? "flex-col items-stretch w-full"
          : "w-full sm:w-auto",
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
              "relative z-1 flex flex-1 sm:flex-none items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus",
              orientation === "vertical" && "w-full sm:flex-1",
              collapsed && "justify-center px-2",
              isOptimistic
                ? "text-kumo-strong"
                : "text-kumo-subtle hover:text-kumo-default",
            )}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {collapsed ? null : <span>{item.label}</span>}
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
