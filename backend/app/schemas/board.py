from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.column import ColumnWithCards


class BoardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    project_id: int | None = None


class BoardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    project_id: int | None = None


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    project_id: int | None
    created_at: datetime


class BoardDetail(BoardOut):
    columns: list[ColumnWithCards] = []
