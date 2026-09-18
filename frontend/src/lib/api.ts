import type {
  AuthResponse,
  DashboardProject,
  GitLabBranch,
  GitLabConnection,
  GitLabElevatedAccess,
  GitLabIssueItem,
  GitLabLoginProvider,
  GitLabMemberCandidate,
  GitLabMergeRequestItem,
  GitLabProjectDetail,
  GitLabProjectIssue,
  GitLabProjectMergeRequest,
  GitLabProjectSummary,
  GitLabWorkStatus,
  OrgMember,
  OrgRole,
  Organization,
  OrganizationWithRole,
  Project,
  ProjectDetail,
  ProjectPerson,
  ProjectWorkItems,
  TeamWorkload,
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

  // Organizations
  listOrganizations: () => request<OrganizationWithRole[]>("/organizations"),

  createOrganization: (name: string) =>
    request<Organization>("/organizations", { method: "POST", body: JSON.stringify({ name }) }),

  listOrgMembers: (orgId: number) => request<OrgMember[]>(`/organizations/${orgId}/members`),

  addOrgMember: (orgId: number, email: string, role: OrgRole, name?: string) =>
    request<OrgMember>(`/organizations/${orgId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role, name: name || undefined }),
    }),

  addOrgMemberFromGitLab: (
    orgId: number,
    candidate: { gitlab_user_id: number; username: string; name: string },
    role: OrgRole
  ) =>
    request<OrgMember>(`/organizations/${orgId}/members/from-gitlab`, {
      method: "POST",
      body: JSON.stringify({ ...candidate, role }),
    }),

  removeOrgMember: (orgId: number, userId: number) =>
    request<void>(`/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),

  listOrgProjects: (orgId: number) => request<Project[]>(`/organizations/${orgId}/projects`),

  createProject: (orgId: number, data: { gitlab_project_id: number; name?: string }) =>
    request<Project>(`/organizations/${orgId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Projects
  getProject: (projectId: number) => request<ProjectDetail>(`/projects/${projectId}`),

  getProjectWorkItems: (projectId: number) => request<ProjectWorkItems>(`/projects/${projectId}/work-items`),

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

  // GitLab connection
  getGitLabConnection: (orgId: number) => request<GitLabConnection>(`/organizations/${orgId}/gitlab`),

  startGitLabOAuth: (orgId: number, data: { base_url: string; client_id: string; client_secret: string }) =>
    request<{ authorize_url: string }>(`/organizations/${orgId}/gitlab/oauth/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  disconnectGitLab: (orgId: number) =>
    request<void>(`/organizations/${orgId}/gitlab`, { method: "DELETE" }),

  // GitLab admin repo explorer (also used to pick a repo when creating a project)
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

  listGitLabMemberCandidates: (orgId: number) =>
    request<GitLabMemberCandidate[]>(`/organizations/${orgId}/gitlab/members`),

  // Team workload
  getTeamWorkload: (orgId: number) => request<TeamWorkload>(`/organizations/${orgId}/team-workload`),

  // Dashboard
  getDashboardProjects: () => request<DashboardProject[]>("/dashboard/projects"),
};
