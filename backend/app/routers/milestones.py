from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.milestone import Milestone
from app.models.user import User
from app.schemas.milestone import MilestoneCreate, MilestoneMetrics, MilestoneOut, MilestoneUpdate
from app.services.metrics import EMPTY_METRICS, compute_milestone_metrics
from app.services.permissions import require_admin_or_pm, require_project_access

router = APIRouter(tags=["milestones"])


async def _get_milestone_or_404(milestone_id: int, db: AsyncSession) -> Milestone:
    milestone = await db.get(Milestone, milestone_id)
    if milestone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
    return milestone


@router.get("/projects/{project_id}/milestones", response_model=list[MilestoneMetrics])
async def list_milestones(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MilestoneMetrics]:
    await require_project_access(project_id, current_user, db)

    result = await db.execute(
        select(Milestone)
        .where(Milestone.project_id == project_id)
        .order_by(Milestone.due_date.nulls_last(), Milestone.title)
    )
    milestones = list(result.scalars().all())
    metrics = await compute_milestone_metrics(project_id, db)

    return [
        MilestoneMetrics(
            id=m.id,
            project_id=m.project_id,
            title=m.title,
            due_date=m.due_date,
            description=m.description,
            created_at=m.created_at,
            **metrics.get(m.id, EMPTY_METRICS),
        )
        for m in milestones
    ]


@router.post(
    "/projects/{project_id}/milestones", response_model=MilestoneOut, status_code=status.HTTP_201_CREATED
)
async def create_milestone(
    project_id: int,
    payload: MilestoneCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Milestone:
    await require_admin_or_pm(project_id, current_user, db)
    milestone = Milestone(
        project_id=project_id,
        title=payload.title,
        due_date=payload.due_date,
        description=payload.description,
    )
    db.add(milestone)
    await db.commit()
    await db.refresh(milestone)
    return milestone


@router.patch("/milestones/{milestone_id}", response_model=MilestoneOut)
async def update_milestone(
    milestone_id: int,
    payload: MilestoneUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Milestone:
    milestone = await _get_milestone_or_404(milestone_id, db)
    await require_admin_or_pm(milestone.project_id, current_user, db)

    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        milestone.title = data["title"]
    if "due_date" in data:
        milestone.due_date = data["due_date"]
    if "description" in data:
        milestone.description = data["description"]

    await db.commit()
    await db.refresh(milestone)
    return milestone


@router.delete("/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(
    milestone_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    milestone = await _get_milestone_or_404(milestone_id, db)
    await require_admin_or_pm(milestone.project_id, current_user, db)
    await db.delete(milestone)
    await db.commit()
