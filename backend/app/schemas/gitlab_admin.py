from pydantic import BaseModel


class GitLabProjectSummary(BaseModel):
    id: int
    name: str
    path_with_namespace: str
    web_url: str
    default_branch: str | None = None
    last_activity_at: str | None = None
    visibility: str
    open_issues_count: int | None = None


class GitLabProjectDetail(GitLabProjectSummary):
    description: str | None = None


class GitLabBranchOut(BaseModel):
    name: str
    default: bool
    protected: bool
    merged: bool
    web_url: str | None = None
    last_commit_message: str | None = None
    last_commit_at: str | None = None


class GitLabProjectMergeRequestOut(BaseModel):
    iid: int
    title: str
    web_url: str
    state: str
    author_username: str | None = None
    source_branch: str
    target_branch: str
    updated_at: str | None = None


class GitLabProjectIssueOut(BaseModel):
    iid: int
    title: str
    web_url: str
    state: str
    author_username: str | None = None
    updated_at: str | None = None
