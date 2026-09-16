from datetime import datetime

from pydantic import BaseModel

from app.schemas.gitlab_admin import GitLabProjectIssueOut, GitLabProjectMergeRequestOut


class DashboardProjectOut(BaseModel):
    id: int
    org_id: int
    org_name: str
    name: str
    created_at: datetime
    gitlab_project_id: int | None
    gitlab_project_path: str | None
    gitlab_web_url: str | None
    gitlab_error: str | None = None
    merge_requests: list[GitLabProjectMergeRequestOut] = []
    issues: list[GitLabProjectIssueOut] = []
