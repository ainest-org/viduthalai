"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { CardWithContext } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PRIORITY_META } from "@/components/kanban/card-meta";
import { Skeleton } from "@/components/ui/skeleton";

function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function byPriorityThenDate(a: CardWithContext, b: CardWithContext): number {
  const ar = a.priority ? PRIORITY_RANK[a.priority] : 3;
  const br = b.priority ? PRIORITY_RANK[b.priority] : 3;
  if (ar !== br) return ar - br;
  return (a.due_date ?? "").localeCompare(b.due_date ?? "");
}

function formatDueDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function TodayPage() {
  const [cards, setCards] = useState<CardWithContext[] | null>(null);

  useEffect(() => {
    api
      .listMyCards()
      .then(setCards)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load your work"));
  }, []);

  const { overdue, dueToday } = useMemo(() => {
    const today = todayISO();
    const overdue: CardWithContext[] = [];
    const dueToday: CardWithContext[] = [];
    for (const card of cards ?? []) {
      if (!card.due_date) continue;
      if (card.due_date < today) overdue.push(card);
      else if (card.due_date === today) dueToday.push(card);
    }
    overdue.sort(byPriorityThenDate);
    dueToday.sort(byPriorityThenDate);
    return { overdue, dueToday };
  }, [cards]);

  if (!cards) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    );
  }

  const total = overdue.length + dueToday.length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My work today</h1>
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "Nothing due — you're all caught up."
            : `${total} card${total === 1 ? "" : "s"} need your attention, across all boards`}
        </p>
      </div>

      {overdue.length > 0 && <CardSection title="Overdue" tone="destructive" cards={overdue} />}
      {dueToday.length > 0 && <CardSection title="Due today" tone="default" cards={dueToday} />}

      {total === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No cards due today or overdue. Set a due date on a card to see it show up here.
        </div>
      )}
    </div>
  );
}

function CardSection({
  title,
  tone,
  cards,
}: {
  title: string;
  tone: "destructive" | "default";
  cards: CardWithContext[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className={cn(
          "text-xs font-semibold tracking-wide uppercase",
          tone === "destructive" ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {title} <span className="font-normal">({cards.length})</span>
      </h2>
      <div className="flex flex-col gap-2">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/boards/${card.board_id}?card=${card.id}`}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200"
          >
            {card.priority && (
              <span
                className={cn("size-2 shrink-0 rounded-full", PRIORITY_META[card.priority].dot)}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-foreground">{card.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {card.board_name} &middot; {card.column_name}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-xs font-medium",
                tone === "destructive" ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {formatDueDate(card.due_date!)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
