from pydantic import BaseModel, ConfigDict, Field

from app.schemas.card import CardOut


class ColumnCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ColumnUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    position: int | None = None


class ColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: int
    board_id: int


class ColumnWithCards(ColumnOut):
    cards: list[CardOut] = []
