"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, GitBranch as GitBranchIcon, GitMerge, ListTodo, Lock } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type {
  GitLabBranch,
  GitLabProjectDetail,
  GitLabProjectIssue,
  GitLabProjectMergeRequest,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { MR_STATE_META } from "@/components/kanban/card-meta";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "merge_requests" | "issues" | "branches";

const TABS: { key: Tab; label: string; icon: typeof GitMerge }[] = [
  { key: "merge_requests", label: "Merge requests", icon: GitMerge },
  { key: "issues", label: "Work items", icon: ListTodo },
  { key: "branches", label: "Branches", icon: GitBranchIcon },
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function GitLabProjectDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId: orgIdParam, projectId: projectIdParam } = use(params);
  const orgId = Number(orgIdParam);
  const projectId = Number(projectIdParam);

  const [project, setProject] = useState<GitLabProjectDetail | null>(null);
  const [tab, setTab] = useState<Tab>("merge_requests");

  const [mergeRequests, setMergeRequests] = useState<GitLabProjectMergeRequest[] | null>(null);
  const [issues, setIssues] = useState<GitLabProjectIssue[] | null>(null);
  const [branches, setBranches] = useState<GitLabBranch[] | null>(null);

  useEffect(() => {
    api
      .getGitLabOrgProject(orgId, projectId)
      .then(setProject)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load repository"));
  }, [orgId, projectId]);

  useEffect(() => {
    if (tab === "merge_requests" && mergeRequests === null) {
      api
        .listGitLabOrgProjectMergeRequests(orgId, projectId)
        .then(setMergeRequests)
        .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load merge requests"));
    }
    if (tab === "issues" && issues === null) {
      api
        .listGitLabOrgProjectIssues(orgId, projectId)
        .then(setIssues)
        .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load work items"));
    }
    if (tab === "branches" && branches === null) {
      api
        .listGitLabOrgProjectBranches(orgId, projectId)
        .then(setBranches)
        .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load branches"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, orgId, projectId]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <Link
          href={`/organizations/${orgId}/gitlab`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Repositories
        </Link>
      </div>

      {!project ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.path_with_namespace}</h1>
            {project.visibility !== "public" && <Lock className="size-4 text-muted-foreground" />}
            <a
              href={project.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
          <p className="text-xs text-muted-foreground">Default branch: {project.default_branch ?? "—"}</p>
        </div>
      )}

      <div className="flex gap-2 border-b border-border/60">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "merge_requests" && (
        <ItemList
          loading={mergeRequests === null}
          empty="No open merge requests."
          items={(mergeRequests ?? []).map((mr) => ({
            key: mr.iid,
            title: `!${mr.iid} ${mr.title}`,
            subtitle: `${mr.source_branch} → ${mr.target_branch}${mr.author_username ? ` · @${mr.author_username}` : ""}`,
            web_url: mr.web_url,
            state: mr.state,
          }))}
        />
      )}

      {tab === "issues" && (
        <ItemList
          loading={issues === null}
          empty="No open work items."
          items={(issues ?? []).map((issue) => ({
            key: issue.iid,
            title: `#${issue.iid} ${issue.title}`,
            subtitle: issue.author_username ? `@${issue.author_username}` : undefined,
            web_url: issue.web_url,
            state: issue.state,
          }))}
        />
      )}

      {tab === "branches" && (
        <div className="flex flex-col gap-2">
          {branches === null ? (
            <>
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </>
          ) : branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No branches found.</p>
          ) : (
            branches.map((branch) => (
              <a
                key={branch.name}
                href={branch.web_url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{branch.name}</p>
                    {branch.default && (
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        default
                      </span>
                    )}
                    {branch.protected && (
                      <Lock className="size-3 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  {branch.last_commit_message && (
                    <p className="truncate text-xs text-muted-foreground">{branch.last_commit_message}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(branch.last_commit_at)}
                </span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface ListItem {
  key: number;
  title: string;
  subtitle?: string;
  web_url: string;
  state: string;
}

function ItemList({ loading, empty, items }: { loading: boolean; empty: string; items: ListItem[] }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <a
          key={item.key}
          href={item.web_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.title}</p>
            {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
          </div>
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              MR_STATE_META[item.state as keyof typeof MR_STATE_META]?.text ?? "text-muted-foreground"
            )}
          >
            {MR_STATE_META[item.state as keyof typeof MR_STATE_META]?.label ?? item.state}
          </span>
        </a>
      ))}
    </div>
  );
}
