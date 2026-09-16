"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, FolderGit2, GitBranch, GitMerge, ListTodo } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { DashboardProject, DeveloperWorkload, TeamWorkload } from "@/lib/types";
import { MR_STATE_META } from "@/lib/gitlab-meta";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const [projects, setProjects] = useState<DashboardProject[] | null>(null);
  const [teamWorkloads, setTeamWorkloads] = useState<{ orgId: number; orgName: string; workload: TeamWorkload }[] | null>(
    null
  );

  useEffect(() => {
    api
      .getDashboardProjects()
      .then(setProjects)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load dashboard"));

    api
      .listOrganizations()
      .then(async (orgs) => {
        const adminOrgs = orgs.filter((o) => o.role === "admin");
        const settled = await Promise.allSettled(
          adminOrgs.map(async (org) => ({
            orgId: org.id,
            orgName: org.name,
            workload: await api.getTeamWorkload(org.id),
          }))
        );
        const results = settled
          .filter((r): r is PromiseFulfilledResult<{ orgId: number; orgName: string; workload: TeamWorkload }> =>
            r.status === "fulfilled"
          )
          .map((r) => r.value);
        const failures = settled.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
          toast.error(
            `Failed to load team workload for ${failures.length} organization${failures.length === 1 ? "" : "s"}`
          );
        }
        setTeamWorkloads(results);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load organizations"));
  }, []);

  const loading = projects === null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your projects and what&apos;s open in each repo</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No projects yet.{" "}
          <Link href="/organizations" className="font-medium text-foreground underline underline-offset-4">
            Create one from an organization
          </Link>{" "}
          once GitLab is connected.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {teamWorkloads && teamWorkloads.length > 0 && (
        <div className="flex flex-col gap-6">
          {teamWorkloads.map(({ orgId, orgName, workload }) => (
            <TeamWorkloadSection key={orgId} orgName={orgName} workload={workload} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: DashboardProject }) {
  const totalOpen = project.merge_requests.length + project.issues.length;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5 card-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/organizations/${project.org_id}/projects/${project.id}`}
            className="text-[15px] font-semibold tracking-tight hover:underline"
          >
            {project.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{project.org_name}</p>
        </div>
        {!project.gitlab_error && (
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {totalOpen} open
          </span>
        )}
      </div>

      {project.gitlab_web_url && (
        <a
          href={project.gitlab_web_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate">{project.gitlab_project_path}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      )}

      {project.gitlab_error ? (
        <p className="text-xs text-muted-foreground">{project.gitlab_error}</p>
      ) : totalOpen === 0 ? (
        <p className="text-xs text-muted-foreground">No open merge requests or work items.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {project.merge_requests.slice(0, 4).map((mr) => (
            <a
              key={`mr-${mr.iid}`}
              href={mr.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs hover:underline"
            >
              <GitMerge className={cn("size-3.5 shrink-0", MR_STATE_META[mr.state]?.text)} />
              <span className="min-w-0 flex-1 truncate text-foreground">{mr.title}</span>
            </a>
          ))}
          {project.issues.slice(0, 4).map((issue) => (
            <a
              key={`issue-${issue.iid}`}
              href={issue.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs hover:underline"
            >
              <ListTodo className={cn("size-3.5 shrink-0", MR_STATE_META[issue.state]?.text)} />
              <span className="min-w-0 flex-1 truncate text-foreground">{issue.title}</span>
            </a>
          ))}
          {totalOpen > 8 && (
            <Link
              href={`/organizations/${project.org_id}/projects/${project.id}`}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              View all {totalOpen}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TeamWorkloadSection({ orgName, workload }: { orgName: string; workload: TeamWorkload }) {
  const busiest = [...workload.developers].sort((a, b) => b.items.length - a.items.length);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {orgName} — team workload
        </h2>
        {!workload.gitlab_connected && (
          <span className="text-xs text-muted-foreground">GitLab not connected</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {busiest.map((dev) => (
          <DeveloperCard key={dev.user_id ?? dev.gitlab_username ?? dev.name} developer={dev} />
        ))}
      </div>
    </section>
  );
}

function DeveloperCard({ developer }: { developer: DeveloperWorkload }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 card-shadow">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
            {initials(developer.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{developer.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {developer.source === "gitlab_only" ? (
                <span className="flex items-center gap-1">
                  <FolderGit2 className="size-3" />
                  GitLab only
                </span>
              ) : (
                <>
                  {developer.role}
                  {developer.gitlab_username && ` · @${developer.gitlab_username}`}
                </>
              )}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {developer.items.length}
        </span>
      </div>

      {developer.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No open work items.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {developer.items.map((item, i) => {
            const Icon = item.type === "merge_request" ? GitMerge : ListTodo;
            return (
              <a
                key={i}
                href={item.web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs hover:underline"
              >
                <Icon className={cn("size-3.5 shrink-0", MR_STATE_META[item.state]?.text)} />
                <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
