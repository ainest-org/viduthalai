from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CardLinkCreate(BaseModel):
    mr_url: str = Field(min_length=1, max_length=1000)


class CardLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    card_id: int
    provider: str
    project_path: str
    mr_iid: int
    mr_url: str
    title: str
    state: str
    source_branch: str | None
    target_branch: str | None
    author_username: str | None
    updated_at: datetime
