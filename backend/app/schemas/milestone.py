from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class MilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    due_date: date | None = None
    description: str | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    due_date: date | None = None
    description: str | None = None


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    due_date: date | None
    description: str | None
    created_at: datetime


class MilestoneMetrics(MilestoneOut):
    total_cards: int
    completed_cards: int
    completion_pct: float
    overdue_count: int
    avg_cycle_time_hours: float | None
