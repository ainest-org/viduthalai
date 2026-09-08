"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { PMOverview, PMProjectCard } from "@/lib/types";
import { dotColorForStatus } from "@/lib/status-colors";
import { PRIORITY_META } from "@/components/kanban/card-meta";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type GroupBy = "status" | "milestone" | "board";

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "milestone", label: "Milestone" },
  { key: "board", label: "Board" },
];

function groupKey(card: PMProjectCard, groupBy: GroupBy): string {
  if (groupBy === "status") return card.column_name;
  if (groupBy === "milestone") return card.milestone_title ?? "No milestone";
  return card.board_name;
}

export default function TeamPage() {
  const [overview, setOverview] = useState<PMOverview | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("status");

  useEffect(() => {
    api
      .getPMOverview()
      .then(setOverview)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load team overview"));
  }, []);

  const grouped = useMemo(() => {
    if (!overview) return [];
    const map = new Map<string, PMProjectCard[]>();
    for (const card of overview.cards) {
      const key = groupKey(card, groupBy);
      const list = map.get(key) ?? [];
      list.push(card);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [overview, groupBy]);

  if (!overview) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    );
  }

  if (overview.projects.length === 0) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          You don&apos;t manage any projects yet. An org admin can assign you as a project manager, or
          create an organization of your own from{" "}
          <Link href="/organizations" className="font-medium text-foreground underline underline-offset-4">
            Organizations
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          {overview.cards.length} card{overview.cards.length === 1 ? "" : "s"} across{" "}
          {overview.projects.length} managed project{overview.projects.length === 1 ? "" : "s"}
        </p>
      </div>

      {overview.milestones.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Milestones
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overview.milestones.map((m) => (
              <div key={m.id} className="rounded-2xl border border-border/60 bg-card p-4 card-shadow">
                <p className="text-sm font-semibold">{m.title}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-base font-semibold tabular-nums">{m.completion_pct}%</p>
                    <p className="text-[11px] text-muted-foreground">complete</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold tabular-nums text-destructive">
                      {m.overdue_count}
                    </p>
                    <p className="text-[11px] text-muted-foreground">overdue</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold tabular-nums">
                      {m.avg_cycle_time_hours !== null ? `${m.avg_cycle_time_hours}h` : "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">cycle time</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            All work
          </h2>
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1">
            {GROUP_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setGroupBy(option.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  groupBy === option.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                Group by {option.label}
              </button>
            ))}
          </div>
        </div>

        {overview.cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cards on your managed projects yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {grouped.map(([group, cards]) => (
              <div
                key={group}
                className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-panel p-3 panel-shadow"
              >
                <div className="flex items-center gap-2 px-1 py-1">
                  {groupBy === "status" && (
                    <span className={cn("size-2 shrink-0 rounded-full", dotColorForStatus(group))} />
                  )}
                  <h3 className="text-[15px] font-semibold tracking-tight">{group}</h3>
                  <span className="text-sm text-muted-foreground">{cards.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {cards.map((card) => (
                    <Link
                      key={card.id}
                      href={`/boards/${card.board_id}?card=${card.id}`}
                      className="block rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[14px] leading-snug font-medium text-foreground">
                          {card.title}
                        </p>
                        {card.priority && (
                          <span
                            className={cn(
                              "shrink-0 text-xs font-medium",
                              PRIORITY_META[card.priority].text
                            )}
                          >
                            {PRIORITY_META[card.priority].label}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {card.project_name} &middot; {card.board_name} &middot; {card.column_name}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
