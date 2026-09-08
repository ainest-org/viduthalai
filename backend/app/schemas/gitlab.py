from datetime import datetime

from pydantic import BaseModel, Field


class GitLabOAuthStart(BaseModel):
    base_url: str = Field(min_length=1, max_length=500)
    client_id: str = Field(min_length=1, max_length=255)
    client_secret: str = Field(min_length=1)


class GitLabOAuthStartOut(BaseModel):
    authorize_url: str


class GitLabConnectionOut(BaseModel):
    connected: bool
    base_url: str | None = None
    client_id: str | None = None
    gitlab_username: str | None = None
    webhook_url: str | None = None
    webhook_secret: str | None = None
    connected_at: datetime | None = None
