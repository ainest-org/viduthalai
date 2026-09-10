from pydantic import BaseModel

from app.schemas.gitlab_admin import GitLabBranchOut, GitLabProjectIssueOut, GitLabProjectMergeRequestOut


class GitLabWorkStatus(BaseModel):
    connected: bool
    gitlab_username: str | None = None


class GitLabMergeRequestOut(BaseModel):
    iid: int
    title: str
    web_url: str
    state: str
    project_name: str | None = None
    source_branch: str | None = None
    target_branch: str | None = None
    updated_at: str | None = None


class GitLabIssueOut(BaseModel):
    iid: int
    title: str
    web_url: str
    state: str
    project_name: str | None = None
    updated_at: str | None = None


class GitLabElevatedRepo(BaseModel):
    id: int
    name: str
    path_with_namespace: str
    web_url: str
    default_branch: str | None = None
    role: str
    branches: list[GitLabBranchOut]
    merge_requests: list[GitLabProjectMergeRequestOut]
    issues: list[GitLabProjectIssueOut]


class GitLabElevatedAccess(BaseModel):
    is_instance_admin: bool
    repos: list[GitLabElevatedRepo]
