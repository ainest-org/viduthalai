import type {
  AuthResponse,
  Board,
  BoardDetail,
  Card,
  CardLink,
  CardWithContext,
  Column,
  GitLabBranch,
  GitLabConnection,
  GitLabElevatedAccess,
  GitLabIssueItem,
  GitLabLoginProvider,
  GitLabMergeRequestItem,
  GitLabProjectDetail,
  GitLabProjectIssue,
  GitLabProjectMergeRequest,
  GitLabProjectSummary,
  GitLabWorkStatus,
  Milestone,
  MilestoneMetrics,
  MRAssignee,
  Notification,
  OrgMember,
  OrgRole,
  Organization,
  OrganizationWithRole,
  PMOverview,
  Priority,
  Project,
  ProjectDetail,
  ProjectPerson,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "viduthalai_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  signup: (email: string, name: string, password: string) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, name, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<AuthResponse["user"]>("/auth/me"),

  // Sign in with GitLab
  listGitLabLoginProviders: () => request<GitLabLoginProvider[]>("/auth/gitlab/providers"),

  startGitLabLogin: (orgId: number) =>
    request<{ authorize_url: string }>("/auth/gitlab/login/start", {
      method: "POST",
      body: JSON.stringify({ org_id: orgId }),
    }),

  exchangeGitLabLogin: (exchange: string) =>
    request<AuthResponse>("/auth/gitlab/exchange", {
      method: "POST",
      body: JSON.stringify({ exchange }),
    }),

  // My GitLab work
  getGitLabWorkStatus: () => request<GitLabWorkStatus>("/me/gitlab/status"),

  listMyGitLabMergeRequests: () => request<GitLabMergeRequestItem[]>("/me/gitlab/merge-requests"),

  listMyGitLabIssues: () => request<GitLabIssueItem[]>("/me/gitlab/issues"),

  getMyGitLabElevatedAccess: () => request<GitLabElevatedAccess>("/me/gitlab/elevated-access"),

  listBoards: () => request<Board[]>("/boards"),

  createBoard: (data: { name: string; project_id?: number | null }) =>
    request<Board>("/boards", { method: "POST", body: JSON.stringify(data) }),

  getBoard: (id: number) => request<BoardDetail>(`/boards/${id}`),

  updateBoard: (id: number, data: { name?: string; project_id?: number | null }) =>
    request<Board>(`/boards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteBoard: (id: number) => request<void>(`/boards/${id}`, { method: "DELETE" }),

  createColumn: (boardId: number, name: string) =>
    request<Column>(`/boards/${boardId}/columns`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  updateColumn: (id: number, data: { name?: string; position?: number }) =>
    request<Column>(`/columns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteColumn: (id: number) => request<void>(`/columns/${id}`, { method: "DELETE" }),

  createCard: (
    columnId: number,
    data: {
      title: string;
      description?: string;
      due_date?: string | null;
      priority?: Priority | null;
      milestone_id?: number | null;
    }
  ) =>
    request<Card>(`/columns/${columnId}/cards`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCard: (
    id: number,
    data: {
      title?: string;
      description?: string | null;
      due_date?: string | null;
      priority?: Priority | null;
      milestone_id?: number | null;
      column_id?: number;
      position?: number;
    }
  ) => request<Card>(`/cards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteCard: (id: number) => request<void>(`/cards/${id}`, { method: "DELETE" }),

  listMyCards: () => request<CardWithContext[]>("/cards"),

  // Organizations
  listOrganizations: () => request<OrganizationWithRole[]>("/organizations"),

  createOrganization: (name: string) =>
    request<Organization>("/organizations", { method: "POST", body: JSON.stringify({ name }) }),

  listOrgMembers: (orgId: number) => request<OrgMember[]>(`/organizations/${orgId}/members`),

  addOrgMember: (orgId: number, email: string, role: OrgRole) =>
    request<OrgMember>(`/organizations/${orgId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),

  removeOrgMember: (orgId: number, userId: number) =>
    request<void>(`/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),

  listOrgProjects: (orgId: number) => request<Project[]>(`/organizations/${orgId}/projects`),

  createProject: (orgId: number, name: string) =>
    request<Project>(`/organizations/${orgId}/projects`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  // Projects
  getProject: (projectId: number) => request<ProjectDetail>(`/projects/${projectId}`),

  listProjectBoards: (projectId: number) => request<Board[]>(`/projects/${projectId}/boards`),

  addProjectManager: (projectId: number, email: string) =>
    request<ProjectPerson>(`/projects/${projectId}/managers`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  removeProjectManager: (projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/managers/${userId}`, { method: "DELETE" }),

  addProjectMember: (projectId: number, email: string) =>
    request<ProjectPerson>(`/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  removeProjectMember: (projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/members/${userId}`, { method: "DELETE" }),

  // Milestones
  listMilestones: (projectId: number) =>
    request<MilestoneMetrics[]>(`/projects/${projectId}/milestones`),

  createMilestone: (projectId: number, data: { title: string; due_date?: string | null; description?: string }) =>
    request<Milestone>(`/projects/${projectId}/milestones`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteMilestone: (milestoneId: number) =>
    request<void>(`/milestones/${milestoneId}`, { method: "DELETE" }),

  // PM overview
  getPMOverview: () => request<PMOverview>("/pm/overview"),

  // GitLab connection
  getGitLabConnection: (orgId: number) => request<GitLabConnection>(`/organizations/${orgId}/gitlab`),

  startGitLabOAuth: (orgId: number, data: { base_url: string; client_id: string; client_secret: string }) =>
    request<{ authorize_url: string }>(`/organizations/${orgId}/gitlab/oauth/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  disconnectGitLab: (orgId: number) =>
    request<void>(`/organizations/${orgId}/gitlab`, { method: "DELETE" }),

  // GitLab admin repo explorer
  listGitLabOrgProjects: (orgId: number) =>
    request<GitLabProjectSummary[]>(`/organizations/${orgId}/gitlab/projects`),

  getGitLabOrgProject: (orgId: number, projectId: number) =>
    request<GitLabProjectDetail>(`/organizations/${orgId}/gitlab/projects/${projectId}`),

  listGitLabOrgProjectBranches: (orgId: number, projectId: number) =>
    request<GitLabBranch[]>(`/organizations/${orgId}/gitlab/projects/${projectId}/branches`),

  listGitLabOrgProjectMergeRequests: (orgId: number, projectId: number) =>
    request<GitLabProjectMergeRequest[]>(`/organizations/${orgId}/gitlab/projects/${projectId}/merge-requests`),

  listGitLabOrgProjectIssues: (orgId: number, projectId: number) =>
    request<GitLabProjectIssue[]>(`/organizations/${orgId}/gitlab/projects/${projectId}/issues`),

  // Card links (GitLab merge requests)
  listCardLinks: (cardId: number) => request<CardLink[]>(`/cards/${cardId}/links`),

  createCardLink: (cardId: number, mrUrl: string) =>
    request<CardLink>(`/cards/${cardId}/links`, {
      method: "POST",
      body: JSON.stringify({ mr_url: mrUrl }),
    }),

  deleteCardLink: (linkId: number) => request<void>(`/card-links/${linkId}`, { method: "DELETE" }),

  // MR assignees
  listAssignableUsers: (linkId: number) =>
    request<ProjectPerson[]>(`/card-links/${linkId}/assignable-users`),

  addMRAssignee: (linkId: number, userId: number) =>
    request<MRAssignee[]>(`/card-links/${linkId}/assignees`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }),

  removeMRAssignee: (linkId: number, userId: number) =>
    request<void>(`/card-links/${linkId}/assignees/${userId}`, { method: "DELETE" }),

  // Notifications
  listNotifications: () => request<Notification[]>("/notifications"),

  getUnreadNotificationCount: () => request<{ count: number }>("/notifications/unread-count"),

  markNotificationRead: (id: number) =>
    request<void>(`/notifications/${id}/read`, { method: "POST" }),

  markAllNotificationsRead: () => request<void>("/notifications/read-all", { method: "POST" }),
};
