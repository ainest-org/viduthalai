"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, GitBranch, Plus, Trash2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { GitLabConnection, OrgMember, OrgRole, Project } from "@/lib/types";
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

const ROLE_OPTIONS: OrgRole[] = ["dev", "pm", "admin"];

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 rounded-lg"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

const EMPTY_CONNECTION: GitLabConnection = {
  connected: false,
  base_url: null,
  client_id: null,
  gitlab_username: null,
  webhook_url: null,
  webhook_secret: null,
  connected_at: null,
};

function GitLabSection({ orgId, isAdmin }: { orgId: number; isAdmin: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<GitLabConnection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");

  function refresh() {
    return api
      .getGitLabConnection(orgId)
      .then(setConnection)
      .catch(() => setConnection(EMPTY_CONNECTION));
  }

  useEffect(() => {
    if (!isAdmin) return;
    refresh();
    setRedirectUri(`${window.location.origin}/api/gitlab/oauth/callback`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const status = searchParams.get("gitlab");
    const error = searchParams.get("gitlab_error");
    if (status === "connected") {
      toast.success("GitLab connected");
      refresh();
      router.replace(`/organizations/${orgId}`, { scroll: false });
    } else if (error) {
      toast.error(error);
      router.replace(`/organizations/${orgId}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isAdmin]);

  if (!isAdmin) return null;

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    if (!baseUrl.trim() || !clientId.trim() || !clientSecret.trim()) return;
    setConnecting(true);
    try {
      const { authorize_url } = await api.startGitLabOAuth(orgId, {
        base_url: baseUrl.trim(),
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
      });
      window.location.href = authorize_url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start GitLab connection");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect GitLab? Existing linked merge requests will stop updating.")) return;
    try {
      await api.disconnectGitLab(orgId);
      setConnection(EMPTY_CONNECTION);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to disconnect GitLab");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">GitLab</h2>
        {!connection?.connected && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-full">
                <GitBranch />
                Connect GitLab
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect a GitLab instance</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground">
                  First, register an OAuth application on your GitLab instance (Admin Area → Applications,
                  or your user Settings → Applications). Set its redirect URI to exactly this, and enable the{" "}
                  <code>read_api</code> scope:
                </p>
                <CopyableField label="Redirect URI" value={redirectUri} />
                <form onSubmit={handleConnect} className="flex flex-col gap-4 border-t border-border/60 pt-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="gitlab-base-url">GitLab base URL</Label>
                    <Input
                      id="gitlab-base-url"
                      autoFocus
                      placeholder="https://gitlab.example.com"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="gitlab-client-id">Application ID</Label>
                    <Input
                      id="gitlab-client-id"
                      placeholder="from the OAuth application you just created"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="gitlab-client-secret">Secret</Label>
                    <Input
                      id="gitlab-client-secret"
                      type="password"
                      placeholder="from the OAuth application you just created"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Stored encrypted.</p>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={connecting}>
                      {connecting ? "Redirecting..." : "Continue to GitLab"}
                      <ExternalLink />
                    </Button>
                  </DialogFooter>
                </form>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {connection?.connected ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{connection.base_url}</p>
              <p className="text-xs text-muted-foreground">
                Connected as @{connection.gitlab_username}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
          <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              Add a webhook in each GitLab project (Settings → Webhooks) with these values, triggered on
              merge request events, so linked cards stay up to date automatically.
            </p>
            {connection.webhook_url && <CopyableField label="Webhook URL" value={connection.webhook_url} />}
            {connection.webhook_secret && (
              <CopyableField label="Secret token" value={connection.webhook_secret} />
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not connected. Link a self-hosted GitLab instance to attach merge requests to cards.
        </p>
      )}
    </section>
  );
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: orgIdParam } = use(params);
  const orgId = Number(orgIdParam);
  const { user } = useAuth();

  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<OrgRole>("dev");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    api
      .listOrgMembers(orgId)
      .then(setMembers)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load members"));
    api
      .listOrgProjects(orgId)
      .then(setProjects)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Failed to load projects"));
  }, [orgId]);

  const isAdmin = members?.some((m) => m.user_id === user?.id && m.role === "admin") ?? false;

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const member = await api.addOrgMember(orgId, memberEmail.trim(), memberRole);
      setMembers((prev) => [...(prev ?? []), member]);
      setMemberEmail("");
      setMemberRole("dev");
      setMemberDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId: number) {
    if (!window.confirm("Remove this member from the organization?")) return;
    const previous = members;
    setMembers((prev) => (prev ?? []).filter((m) => m.user_id !== userId));
    try {
      await api.removeOrgMember(orgId, userId);
    } catch (err) {
      setMembers(previous);
      toast.error(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    setCreatingProject(true);
    try {
      const project = await api.createProject(orgId, projectName.trim());
      setProjects((prev) => [...(prev ?? []), project]);
      setProjectName("");
      setProjectDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create project");
    } finally {
      setCreatingProject(false);
    }
  }

  const loading = members === null || projects === null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-8">
      <div>
        <Link href="/organizations" className="text-sm text-muted-foreground hover:text-foreground">
          ← Organizations
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Members</h2>
              {isAdmin && (
                <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-full">
                      <Plus />
                      Add member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add a member</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddMember} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="member-email">Email</Label>
                        <Input
                          id="member-email"
                          type="email"
                          autoFocus
                          placeholder="person@example.com"
                          value={memberEmail}
                          onChange={(e) => setMemberEmail(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          They need an existing Viduthalai account.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Role</Label>
                        <div className="flex gap-2">
                          {ROLE_OPTIONS.map((role) => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => setMemberRole(role)}
                              className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                                memberRole === role
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border/60 bg-card text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
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

            <div className="flex flex-col gap-2">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                      {member.role}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <GitLabSection orgId={orgId} isAdmin={isAdmin} />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Projects</h2>
              {isAdmin && (
                <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-full">
                      <Plus />
                      New project
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create a project</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
                      <Input
                        autoFocus
                        placeholder="Project name"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={creatingProject}>
                          {creatingProject ? "Creating..." : "Create project"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/organizations/${orgId}/projects/${project.id}`}
                    className="block rounded-xl border border-border/60 bg-card p-4 card-shadow card-shadow-hover transition-shadow duration-200"
                  >
                    <p className="text-sm font-medium">{project.name}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
