"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CircleDot, Lock } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { GitLabProjectSummary } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

function formatRelative(value: string | null): string {
  if (!value) return "No activity yet";
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function GitLabProjectsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: orgIdParam } = use(params);
  const orgId = Number(orgIdParam);

  const [projects, setProjects] = useState<GitLabProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listGitLabOrgProjects(orgId)
      .then(setProjects)
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "Failed to load repositories";
        setError(message);
        toast.error(message);
      });
  }, [orgId]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <Link
          href={`/organizations/${orgId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organization
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          Every GitLab project this organization&apos;s connection has access to.
        </p>
      </div>

      {projects === null && !error && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No repositories found for this GitLab connection.
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="flex flex-col gap-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/organizations/${orgId}/gitlab/${project.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4 card-shadow card-shadow-hover transition-shadow duration-200"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{project.path_with_namespace}</p>
                  {project.visibility !== "public" && (
                    <Lock className="size-3 shrink-0 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Default branch: {project.default_branch ?? "—"} &middot; Updated{" "}
                  {formatRelative(project.last_activity_at)}
                </p>
              </div>
              {project.open_issues_count !== null && (
                <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CircleDot className="size-3.5" />
                  {project.open_issues_count} open
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
