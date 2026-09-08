from datetime import date

from pydantic import BaseModel

from app.schemas.card import Priority
from app.schemas.milestone import MilestoneMetrics


class PMProjectOut(BaseModel):
    id: int
    org_id: int
    name: str


class PMProjectCard(BaseModel):
    id: int
    title: str
    priority: Priority | None
    due_date: date | None
    column_name: str
    board_id: int
    board_name: str
    project_id: int
    project_name: str
    milestone_id: int | None
    milestone_title: str | None


class PMOverview(BaseModel):
    projects: list[PMProjectOut]
    cards: list[PMProjectCard]
    milestones: list[MilestoneMetrics]
