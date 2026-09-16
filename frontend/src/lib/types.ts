export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
  gitlab_username: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type MergeRequestState = "opened" | "closed" | "merged" | "locked";

export type OrgRole = "admin" | "pm" | "dev";

export interface Organization {
  id: number;
  name: string;
  created_at: string;
}

export interface OrganizationWithRole extends Organization {
  role: OrgRole;
}

export interface OrgMember {
  user_id: number;
  name: string;
  email: string;
  role: OrgRole;
}

export interface Project {
  id: number;
  org_id: number;
  name: string;
  created_at: string;
  gitlab_project_id: number | null;
  gitlab_project_path: string | null;
  gitlab_web_url: string | null;
  gitlab_default_branch: string | null;
}

export interface ProjectPerson {
  user_id: number;
  name: string;
  email: string;
}

export interface ProjectDetail extends Project {
  managers: ProjectPerson[];
  members: ProjectPerson[];
}

export interface GitLabConnection {
  connected: boolean;
  base_url: string | null;
  client_id: string | null;
  gitlab_username: string | null;
  connected_at: string | null;
}

export interface GitLabLoginProvider {
  org_id: number;
  base_url: string;
}

export interface GitLabWorkStatus {
  connected: boolean;
  gitlab_username: string | null;
}

export interface GitLabMergeRequestItem {
  iid: number;
  title: string;
  web_url: string;
  state: MergeRequestState;
  project_name: string | null;
  source_branch: string | null;
  target_branch: string | null;
  updated_at: string | null;
}

export interface GitLabIssueItem {
  iid: number;
  title: string;
  web_url: string;
  state: MergeRequestState;
  project_name: string | null;
  updated_at: string | null;
}

export interface GitLabProjectSummary {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string | null;
  last_activity_at: string | null;
  visibility: string;
  open_issues_count: number | null;
}

export interface GitLabProjectDetail extends GitLabProjectSummary {
  description: string | null;
}

export interface GitLabBranch {
  name: string;
  default: boolean;
  protected: boolean;
  merged: boolean;
  web_url: string | null;
  last_commit_message: string | null;
  last_commit_at: string | null;
}

export interface GitLabProjectMergeRequest {
  iid: number;
  title: string;
  web_url: string;
  state: MergeRequestState;
  author_username: string | null;
  source_branch: string;
  target_branch: string;
  updated_at: string | null;
}

export interface GitLabProjectIssue {
  iid: number;
  title: string;
  web_url: string;
  state: MergeRequestState;
  author_username: string | null;
  updated_at: string | null;
}

export interface ProjectWorkItems {
  merge_requests: GitLabProjectMergeRequest[];
  issues: GitLabProjectIssue[];
}

export interface DashboardProject extends Project {
  org_name: string;
  gitlab_error: string | null;
  merge_requests: GitLabProjectMergeRequest[];
  issues: GitLabProjectIssue[];
}

export interface WorkItem {
  type: "merge_request" | "issue";
  title: string;
  web_url: string;
  state: MergeRequestState;
  project_name: string | null;
  source: "gitlab" | "viduthalai";
}

export interface DeveloperWorkload {
  source: "viduthalai" | "gitlab_only";
  user_id: number | null;
  name: string;
  email: string | null;
  gitlab_username: string | null;
  role: OrgRole | null;
  items: WorkItem[];
}

export interface TeamWorkload {
  gitlab_connected: boolean;
  developers: DeveloperWorkload[];
}

export interface GitLabElevatedRepo {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string | null;
  role: string;
  branches: GitLabBranch[];
  merge_requests: GitLabProjectMergeRequest[];
  issues: GitLabProjectIssue[];
}

export interface GitLabElevatedAccess {
  is_instance_admin: boolean;
  repos: GitLabElevatedRepo[];
}
