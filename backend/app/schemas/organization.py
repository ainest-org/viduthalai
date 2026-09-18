from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Role = Literal["admin", "pm", "dev"]


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime


class OrganizationWithRole(OrganizationOut):
    role: Role


class OrgMemberOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: Role


class ProjectPersonOut(BaseModel):
    user_id: int
    name: str
    email: str


class MemberAdd(BaseModel):
    email: EmailStr
    role: Role = "dev"
    name: str | None = Field(default=None, max_length=255)
    """If no Viduthalai account exists for this email yet, a new one is created with this name."""


class GitLabMemberCandidateOut(BaseModel):
    gitlab_user_id: int
    username: str
    name: str
    avatar_url: str | None = None


class MemberAddFromGitLab(BaseModel):
    gitlab_user_id: int
    username: str
    name: str
    role: Role = "dev"
