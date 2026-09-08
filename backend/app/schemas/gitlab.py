from datetime import datetime

from pydantic import BaseModel, Field


class GitLabConnect(BaseModel):
    base_url: str = Field(min_length=1, max_length=500)
    token: str = Field(min_length=1)


class GitLabConnectionOut(BaseModel):
    connected: bool
    base_url: str | None = None
    gitlab_username: str | None = None
    webhook_url: str | None = None
    webhook_secret: str | None = None
    connected_at: datetime | None = None
