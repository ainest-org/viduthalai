import { Calendar, GitMerge } from "lucide-react";

import type { Card, MergeRequestState, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

export const MR_STATE_META: Record<MergeRequestState, { label: string; text: string }> = {
  opened: { label: "Open", text: "text-[#0a84ff]" },
  merged: { label: "Merged", text: "text-[#8944ab]" },
  closed: { label: "Closed", text: "text-[#ff375f]" },
  locked: { label: "Locked", text: "text-muted-foreground" },
};

export const PRIORITY_OPTIONS: Priority[] = ["low", "medium", "high"];

export const PRIORITY_META: Record<Priority, { label: string; dot: string; text: string }> = {
  low: { label: "Low", dot: "bg-[#0a84ff]", text: "text-[#0a84ff]" },
  medium: { label: "Medium", dot: "bg-[#ff9f0a]", text: "text-[#ff9f0a]" },
  high: { label: "High", dot: "bg-[#ff375f]", text: "text-[#ff375f]" },
};

function formatDueDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(value: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T00:00:00`) < today;
}

export function CardMeta({ card }: { card: Pick<Card, "due_date" | "priority" | "links"> }) {
  const hasLinks = card.links && card.links.length > 0;
  if (!card.due_date && !card.priority && !hasLinks) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2.5">
      {card.priority && (
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            PRIORITY_META[card.priority].text
          )}
        >
          <span className={cn("size-1.5 rounded-full", PRIORITY_META[card.priority].dot)} />
          {PRIORITY_META[card.priority].label}
        </span>
      )}
      {card.due_date && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            isOverdue(card.due_date) ? "text-destructive" : "text-muted-foreground"
          )}
        >
          <Calendar className="size-3" />
          {formatDueDate(card.due_date)}
        </span>
      )}
      {hasLinks &&
        card.links.map((link) => (
          <a
            key={link.id}
            href={link.mr_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={link.title}
            className={cn(
              "flex items-center gap-1 text-xs font-medium hover:underline",
              MR_STATE_META[link.state]?.text ?? "text-muted-foreground"
            )}
          >
            <GitMerge className="size-3" />
            !{link.mr_iid}
          </a>
        ))}
    </div>
  );
}
