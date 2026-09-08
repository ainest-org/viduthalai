from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.card_link import CardLinkOut

Priority = Literal["low", "medium", "high"]


class CardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None
    priority: Priority | None = None
    milestone_id: int | None = None


class CardUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None
    priority: Priority | None = None
    milestone_id: int | None = None
    column_id: int | None = None
    position: int | None = None


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    due_date: date | None
    priority: Priority | None
    milestone_id: int | None
    position: int
    column_id: int
    links: list[CardLinkOut] = []


class CardWithContext(CardOut):
    created_at: datetime
    column_name: str
    board_id: int
    board_name: str
