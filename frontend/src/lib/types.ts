export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Board {
  id: number;
  name: string;
  project_id: number | null;
  created_at: string;
}

export type Priority = "low" | "medium" | "high";

export type MergeRequestState = "opened" | "closed" | "merged" | "locked";

export interface CardLink {
  id: number;
  card_id: number;
  provider: string;
  project_path: string;
  mr_iid: number;
  mr_url: string;
  title: string;
  state: MergeRequestState;
  source_branch: string | null;
  target_branch: string | null;
  author_username: string | null;
  updated_at: string;
}

export interface Card {
  id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority | null;
  milestone_id: number | null;
  position: number;
  column_id: number;
  links: CardLink[];
}

export interface Column {
  id: number;
  name: string;
  position: number;
  board_id: number;
  cards: Card[];
}

export interface BoardDetail extends Board {
  columns: Column[];
}

export interface CardWithContext extends Card {
  created_at: string;
  column_name: string;
  board_id: number;
  board_name: string;
}

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

export interface Milestone {
  id: number;
  project_id: number;
  title: string;
  due_date: string | null;
  description: string | null;
  created_at: string;
}

export interface MilestoneMetrics extends Milestone {
  total_cards: number;
  completed_cards: number;
  completion_pct: number;
  overdue_count: number;
  avg_cycle_time_hours: number | null;
}

export interface PMProjectCard {
  id: number;
  title: string;
  priority: Priority | null;
  due_date: string | null;
  column_name: string;
  board_id: number;
  board_name: string;
  project_id: number;
  project_name: string;
  milestone_id: number | null;
  milestone_title: string | null;
}

export interface PMOverview {
  projects: Project[];
  cards: PMProjectCard[];
  milestones: MilestoneMetrics[];
}

export interface GitLabConnection {
  connected: boolean;
  base_url: string | null;
  client_id: string | null;
  gitlab_username: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  connected_at: string | null;
}
