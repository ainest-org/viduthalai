from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.organization import ProjectPersonOut


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: int
    name: str
    created_at: datetime


class ProjectDetail(ProjectOut):
    managers: list[ProjectPersonOut]
    members: list[ProjectPersonOut]


class AddPerson(BaseModel):
    email: EmailStr
