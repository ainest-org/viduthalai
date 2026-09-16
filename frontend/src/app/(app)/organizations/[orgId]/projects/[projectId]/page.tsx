"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, GitBranch, GitMerge, ListTodo, Plus, Trash2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ProjectDetail, ProjectWorkItems } from "@/lib/types";
import { MR_STATE_META } from "@/lib/gitlab-meta";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function PersonList({
  people,
  canRemove,
  onRemove,
}: {
  people: { user_id: number; name: string; email: string }[];
  canRemove: boolean;
  onRemove: (userId: number) => void;
}) {
  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">None yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {people.map((person) => (
        <div
          key={person.user_id}
          className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-2.5"
        >
          <div>
            <p className="text-sm font-medium">{person.name}</p>
            <p className="text-xs text-muted-foreground">{person.email}</p>
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(person.user_id)}
              className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId: orgIdParam, projectId: projectIdParam } = use(params);
  const orgId = Number(orgIdParam);
  const projectId = Number(projectIdParam);
  const { user } = useAuth();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [workItems, setWorkItems] = useState<ProjectWorkItems | null>(null);
  const [workItemsError, setWorkItemsError] = useState<string | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const [managerEmail, setManagerEmail] = useState("");
  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [addingManager, setAddingManager] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    api
      .getProject(projectId)
      .then(setProject)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load project"));
    api
      .getProjectWorkItems(projectId)
      .then(setWorkItems)
      .catch((err) => setWorkItemsError(err instanceof ApiError ? err.message : "Failed to load work items"));
    api
      .listOrganizations()
      .then((orgs) => setIsOrgAdmin(orgs.some((o) => o.id === orgId && o.role === "admin")))
      .catch(() => undefined);
  }, [projectId, orgId]);

  const isManager = project?.managers.some((m) => m.user_id === user?.id) ?? false;
  const canManage = isOrgAdmin || isManager;

  async function handleAddManager(e: FormEvent) {
    e.preventDefault();
    if (!managerEmail.trim() || !project) return;
    setAddingManager(true);
    try {
      const person = await api.addProjectManager(projectId, managerEmail.trim());
      setProject({ ...project, managers: [...project.managers, person] });
      setManagerEmail("");
      setManagerDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add manager");
    } finally {
      setAddingManager(false);
    }
  }

  async function handleRemoveManager(userId: number) {
    if (!project) return;
    const previous = project;
    setProject({ ...project, managers: project.managers.filter((m) => m.user_id !== userId) });
    try {
      await api.removeProjectManager(projectId, userId);
    } catch (err) {
      setProject(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to remove manager");
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!memberEmail.trim() || !project) return;
    setAddingMember(true);
    try {
      const person = await api.addProjectMember(projectId, memberEmail.trim());
      setProject({ ...project, members: [...project.members, person] });
      setMemberEmail("");
      setMemberDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId: number) {
    if (!project) return;
    const previous = project;
    setProject({ ...project, members: project.members.filter((m) => m.user_id !== userId) });
    try {
      await api.removeProjectMember(projectId, userId);
    } catch (err) {
      setProject(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  }

  if (!project) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const totalOpen = workItems ? workItems.merge_requests.length + workItems.issues.length : 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-1">
        <Link
          href={`/organizations/${orgId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organization
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        {project.gitlab_web_url && (
          <a
            href={project.gitlab_web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <GitBranch className="size-3.5 shrink-0" />
            {project.gitlab_project_path}
            <ExternalLink className="size-3 shrink-0" />
          </a>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Work items {workItems && <span className="font-normal text-muted-foreground">({totalOpen})</span>}
        </h2>

        {workItemsError ? (
          <p className="text-sm text-muted-foreground">{workItemsError}</p>
        ) : !workItems ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : totalOpen === 0 ? (
          <p className="text-sm text-muted-foreground">No open merge requests or work items in this repo.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {workItems.merge_requests.map((mr) => (
              <a
                key={`mr-${mr.iid}`}
                href={mr.web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200"
              >
                <GitMerge className={cn("size-4 shrink-0", MR_STATE_META[mr.state]?.text)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-foreground">{mr.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {mr.source_branch} → {mr.target_branch}
                    {mr.author_username && ` · @${mr.author_username}`}
                  </p>
                </div>
                <span className={cn("shrink-0 text-xs font-medium", MR_STATE_META[mr.state]?.text)}>
                  {MR_STATE_META[mr.state]?.label ?? mr.state}
                </span>
              </a>
            ))}
            {workItems.issues.map((issue) => (
              <a
                key={`issue-${issue.iid}`}
                href={issue.web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 card-shadow card-shadow-hover transition-shadow duration-200"
              >
                <ListTodo className={cn("size-4 shrink-0", MR_STATE_META[issue.state]?.text)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-foreground">{issue.title}</p>
                  {issue.author_username && (
                    <p className="truncate text-xs text-muted-foreground">@{issue.author_username}</p>
                  )}
                </div>
                <span className={cn("shrink-0 text-xs font-medium", MR_STATE_META[issue.state]?.text)}>
                  {MR_STATE_META[issue.state]?.label ?? issue.state}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Managers</h2>
          {isOrgAdmin && (
            <Dialog open={managerDialogOpen} onOpenChange={setManagerDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full">
                  <Plus />
                  Add manager
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a project manager</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddManager} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="manager-email">Email</Label>
                    <Input
                      id="manager-email"
                      type="email"
                      autoFocus
                      placeholder="pm@example.com"
                      value={managerEmail}
                      onChange={(e) => setManagerEmail(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={addingManager}>
                      {addingManager ? "Adding..." : "Add manager"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <PersonList people={project.managers} canRemove={isOrgAdmin} onRemove={handleRemoveManager} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Members</h2>
          {canManage && (
            <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full">
                  <Plus />
                  Add member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a project member</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddMember} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="dev-email">Email</Label>
                    <Input
                      id="dev-email"
                      type="email"
                      autoFocus
                      placeholder="dev@example.com"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={addingMember}>
                      {addingMember ? "Adding..." : "Add member"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <PersonList people={project.members} canRemove={canManage} onRemove={handleRemoveMember} />
      </section>
    </div>
  );
}
