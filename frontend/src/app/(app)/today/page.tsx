"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, GitBranch, GitMerge, ListTodo, ShieldCheck } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type {
  CardWithContext,
  GitLabElevatedAccess,
  GitLabIssueItem,
  GitLabMergeRequestItem,
  GitLabWorkStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { MR_STATE_META, PRIORITY_META } from "@/components/kanban/card-meta";
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
  const [gitlabStatus, setGitlabStatus] = useState<GitLabWorkStatus | null>(null);
  const [mergeRequests, setMergeRequests] = useState<GitLabMergeRequestItem[] | null>(null);
  const [issues, setIssues] = useState<GitLabIssueItem[] | null>(null);
  const [elevatedAccess, setElevatedAccess] = useState<GitLabElevatedAccess | null>(null);

  useEffect(() => {
    api
      .listMyCards()
      .then(setCards)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load your work"));

    api
      .getGitLabWorkStatus()
      .then((status) => {
        setGitlabStatus(status);
        if (!status.connected) return;
        api.listMyGitLabMergeRequests().then(setMergeRequests).catch(() => setMergeRequests([]));
        api.listMyGitLabIssues().then(setIssues).catch(() => setIssues([]));
        api
          .getMyGitLabElevatedAccess()
          .then(setElevatedAccess)
          .catch(() => setElevatedAccess({ is_instance_admin: false, repos: [] }));
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load GitLab status"));
  }, []);

  const roleLabel = elevatedAccess?.is_instance_admin
    ? "Instance Admin"
    : elevatedAccess?.repos.some((r) => r.role === "Owner")
      ? "Owner"
      : elevatedAccess && elevatedAccess.repos.length > 0
        ? "Maintainer"
        : null;

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
        {gitlabStatus && (
          <p className="mt-1 text-xs text-muted-foreground">
            {gitlabStatus.connected ? (
              <>GitLab connected as @{gitlabStatus.gitlab_username}</>
            ) : (
              <>GitLab not connected — sign in with GitLab from the login page to see your MRs and work items here.</>
            )}
          </p>
        )}
        {roleLabel && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
            <ShieldCheck className="size-3.5" />
            GitLab role: {roleLabel}
          </p>
        )}
      </div>

      {overdue.length > 0 && <CardSection title="Overdue" tone="destructive" cards={overdue} />}
      {dueToday.length > 0 && <CardSection title="Due today" tone="default" cards={dueToday} />}

      {gitlabStatus?.connected && (
        <GitLabSection
          title="My merge requests"
          icon={<GitMerge className="size-3.5" />}
          loading={mergeRequests === null}
          empty="No open merge requests assigned to you."
          items={(mergeRequests ?? []).map((mr) => ({
            key: mr.iid,
            title: mr.title,
            subtitle: mr.project_name ?? undefined,
            web_url: mr.web_url,
            state: mr.state,
          }))}
        />
      )}

      {gitlabStatus?.connected && (
        <GitLabSection
          title="My work items"
          icon={<ListTodo className="size-3.5" />}
          loading={issues === null}
          empty="No open work items assigned to you."
          items={(issues ?? []).map((issue) => ({
            key: issue.iid,
            title: issue.title,
            subtitle: issue.project_name ?? undefined,
            web_url: issue.web_url,
            state: issue.state,
          }))}
        />
      )}

      {elevatedAccess && elevatedAccess.repos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ShieldCheck className="size-3.5" />
            Repositories you maintain <span className="font-normal">({elevatedAccess.repos.length})</span>
          </h2>
          <div className="flex flex-col gap-3">
            {elevatedAccess.repos.map((repo) => (
              <ElevatedRepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        </section>
      )}

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

interface GitLabItem {
  key: number;
  title: string;
  subtitle?: string;
  web_url: string;
  state: GitLabMergeRequestItem["state"];
}

function GitLabSection({
  title,
  icon,
  items,
  loading,
  empty,
}: {
  title: string;
  icon: ReactNode;
  items: GitLabItem[];
  loading: boolean;
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}
        {title} {!loading && <span className="font-normal">({items.length})</span>}
      </h2>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <a
            key={item.key}
            href={item.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-foreground">{item.title}</p>
              {item.subtitle && (
                <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-xs font-medium",
                MR_STATE_META[item.state]?.text ?? "text-muted-foreground"
              )}
            >
              {MR_STATE_META[item.state]?.label ?? item.state}
            </span>
          </a>
        ))}
      </div>
      )}
    </section>
  );
}

function ElevatedRepoCard({ repo }: { repo: GitLabElevatedAccess["repos"][number] }) {
  const hasActivity = repo.branches.length > 0 || repo.merge_requests.length > 0 || repo.issues.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <a
          href={repo.web_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
        >
          <span className="truncate">{repo.path_with_namespace}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {repo.role}
        </span>
      </div>

      {repo.branches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {repo.branches.map((branch) => (
            <span
              key={branch.name}
              className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground"
            >
              <GitBranch className="size-3" />
              {branch.name}
              {branch.default && <span className="text-foreground">(default)</span>}
            </span>
          ))}
        </div>
      )}

      {repo.merge_requests.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {repo.merge_requests.map((mr) => (
            <a
              key={mr.iid}
              href={mr.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs hover:underline"
            >
              <GitMerge className={cn("size-3.5 shrink-0", MR_STATE_META[mr.state]?.text)} />
              <span className="min-w-0 flex-1 truncate text-foreground">
                !{mr.iid} {mr.title}
              </span>
            </a>
          ))}
        </div>
      )}

      {repo.issues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {repo.issues.map((issue) => (
            <a
              key={issue.iid}
              href={issue.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs hover:underline"
            >
              <ListTodo className={cn("size-3.5 shrink-0", MR_STATE_META[issue.state]?.text)} />
              <span className="min-w-0 flex-1 truncate text-foreground">
                #{issue.iid} {issue.title}
              </span>
            </a>
          ))}
        </div>
      )}

      {!hasActivity && <p className="text-xs text-muted-foreground">No open activity in this repo.</p>}
    </div>
  );
}
