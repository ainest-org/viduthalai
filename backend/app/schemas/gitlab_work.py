from pydantic import BaseModel


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
