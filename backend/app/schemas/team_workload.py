from pydantic import BaseModel


class WorkItemOut(BaseModel):
    type: str  # "merge_request" | "issue"
    title: str
    web_url: str
    state: str
    project_name: str | None = None
    source: str  # "gitlab" | "viduthalai"


class DeveloperWorkload(BaseModel):
    source: str  # "viduthalai" | "gitlab_only"
    user_id: int | None = None
    name: str
    email: str | None = None
    gitlab_username: str | None = None
    role: str | None = None
    items: list[WorkItemOut]


class TeamWorkloadOut(BaseModel):
    gitlab_connected: bool
    developers: list[DeveloperWorkload]
