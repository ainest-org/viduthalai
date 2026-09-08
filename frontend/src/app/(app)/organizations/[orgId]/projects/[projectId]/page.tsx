"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Board, MilestoneMetrics, ProjectDetail } from "@/lib/types";
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
  const [milestones, setMilestones] = useState<MilestoneMetrics[] | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardDialogOpen, setBoardDialogOpen] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);

  const [managerEmail, setManagerEmail] = useState("");
  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [addingManager, setAddingManager] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState("");
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [creatingMilestone, setCreatingMilestone] = useState(false);

  useEffect(() => {
    api
      .getProject(projectId)
      .then(setProject)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load project"));
    api
      .listMilestones(projectId)
      .then(setMilestones)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load milestones"));
    api
      .listProjectBoards(projectId)
      .then(setBoards)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load boards"));
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

  async function handleCreateMilestone(e: FormEvent) {
    e.preventDefault();
    if (!milestoneTitle.trim()) return;
    setCreatingMilestone(true);
    try {
      const milestone = await api.createMilestone(projectId, {
        title: milestoneTitle.trim(),
        due_date: milestoneDueDate || null,
      });
      setMilestones((prev) => [
        ...(prev ?? []),
        {
          ...milestone,
          total_cards: 0,
          completed_cards: 0,
          completion_pct: 0,
          overdue_count: 0,
          avg_cycle_time_hours: null,
        },
      ]);
      setMilestoneTitle("");
      setMilestoneDueDate("");
      setMilestoneDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create milestone");
    } finally {
      setCreatingMilestone(false);
    }
  }

  async function handleCreateBoard(e: FormEvent) {
    e.preventDefault();
    if (!boardName.trim()) return;
    setCreatingBoard(true);
    try {
      const board = await api.createBoard({ name: boardName.trim(), project_id: projectId });
      setBoards((prev) => [...(prev ?? []), board]);
      setBoardName("");
      setBoardDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create board");
    } finally {
      setCreatingBoard(false);
    }
  }

  async function handleDeleteMilestone(milestoneId: number) {
    if (!window.confirm("Delete this milestone? Cards linked to it will be unlinked, not deleted.")) return;
    const previous = milestones;
    setMilestones((prev) => (prev ?? []).filter((m) => m.id !== milestoneId));
    try {
      await api.deleteMilestone(milestoneId);
    } catch (err) {
      setMilestones(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to delete milestone");
    }
  }

  if (!project || !milestones || !boards) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

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
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Boards</h2>
          {canManage && (
            <Dialog open={boardDialogOpen} onOpenChange={setBoardDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full">
                  <Plus />
                  New board
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a board</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateBoard} className="flex flex-col gap-4">
                  <Input
                    autoFocus
                    placeholder="Board name"
                    value={boardName}
                    onChange={(e) => setBoardName(e.target.value)}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={creatingBoard}>
                      {creatingBoard ? "Creating..." : "Create board"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No boards yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {boards.map((board) => (
              <Link
                key={board.id}
                href={`/boards/${board.id}`}
                className="block rounded-xl border border-border/60 bg-card p-4 card-shadow card-shadow-hover transition-shadow duration-200"
              >
                <p className="text-sm font-medium">{board.name}</p>
              </Link>
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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Milestones</h2>
          {canManage && (
            <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full">
                  <Plus />
                  New milestone
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a milestone</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateMilestone} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="milestone-title">Title</Label>
                    <Input
                      id="milestone-title"
                      autoFocus
                      placeholder="v1.0 launch"
                      value={milestoneTitle}
                      onChange={(e) => setMilestoneTitle(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="milestone-due">Due date</Label>
                    <Input
                      id="milestone-due"
                      type="date"
                      value={milestoneDueDate}
                      onChange={(e) => setMilestoneDueDate(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={creatingMilestone}>
                      {creatingMilestone ? "Creating..." : "Create milestone"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-border/60 bg-card p-4 card-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{m.title}</p>
                    {m.due_date && (
                      <p className="text-xs text-muted-foreground">
                        Due {new Date(`${m.due_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMilestone(m.id)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{m.completion_pct}%</p>
                    <p className="text-xs text-muted-foreground">
                      complete ({m.completed_cards}/{m.total_cards})
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-destructive">{m.overdue_count}</p>
                    <p className="text-xs text-muted-foreground">overdue</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">
                      {m.avg_cycle_time_hours !== null ? `${m.avg_cycle_time_hours}h` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">avg cycle time</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{m.total_cards}</p>
                    <p className="text-xs text-muted-foreground">total cards</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
