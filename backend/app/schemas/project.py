from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.organization import ProjectPersonOut


class ProjectCreate(BaseModel):
    gitlab_project_id: int
    name: str | None = Field(default=None, min_length=1, max_length=255)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: int
    name: str
    created_at: datetime
    gitlab_project_id: int | None
    gitlab_project_path: str | None
    gitlab_web_url: str | None
    gitlab_default_branch: str | None


class ProjectDetail(ProjectOut):
    managers: list[ProjectPersonOut]
    members: list[ProjectPersonOut]


class AddPerson(BaseModel):
    email: EmailStr
