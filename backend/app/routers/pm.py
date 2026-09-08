from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.board import Board
from app.models.card import Card
from app.models.column import Column
from app.models.milestone import Milestone
from app.models.organization import OrgMembership
from app.models.project import Project, ProjectManager
from app.models.user import User
from app.schemas.pm import PMOverview, PMProjectCard, PMProjectOut
from app.services.metrics import EMPTY_METRICS, compute_milestone_metrics

router = APIRouter(prefix="/pm", tags=["pm"])


@router.get("/overview", response_model=PMOverview)
async def get_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PMOverview:
    """Cards and milestone metrics across every project this user manages.

    A user "manages" a project if they're an org admin (of the project's org)
    or explicitly assigned as a project manager.
    """
    admin_orgs_result = await db.execute(
        select(OrgMembership.org_id).where(
            OrgMembership.user_id == current_user.id, OrgMembership.role == "admin"
        )
    )
    admin_org_ids = [row[0] for row in admin_orgs_result.all()]

    managed_result = await db.execute(
        select(Project.id)
        .join(ProjectManager, ProjectManager.project_id == Project.id)
        .where(ProjectManager.user_id == current_user.id)
    )
    managed_project_ids = {row[0] for row in managed_result.all()}

    if admin_org_ids:
        admin_projects_result = await db.execute(
            select(Project.id).where(Project.org_id.in_(admin_org_ids))
        )
        managed_project_ids.update(row[0] for row in admin_projects_result.all())

    if not managed_project_ids:
        return PMOverview(projects=[], cards=[], milestones=[])

    projects_result = await db.execute(
        select(Project).where(Project.id.in_(managed_project_ids)).order_by(Project.name)
    )
    projects = list(projects_result.scalars().all())
    project_names = {p.id: p.name for p in projects}

    cards_result = await db.execute(
        select(
            Card,
            Column.name.label("column_name"),
            Board.id.label("board_id"),
            Board.name.label("board_name"),
            Board.project_id.label("project_id"),
            Milestone.title.label("milestone_title"),
        )
        .join(Column, Column.id == Card.column_id)
        .join(Board, Board.id == Column.board_id)
        .outerjoin(Milestone, Milestone.id == Card.milestone_id)
        .where(Board.project_id.in_(managed_project_ids))
        .order_by(Board.name, Column.position, Card.position)
    )

    cards = [
        PMProjectCard(
            id=card.id,
            title=card.title,
            priority=card.priority,
            due_date=card.due_date,
            column_name=column_name,
            board_id=board_id,
            board_name=board_name,
            project_id=project_id,
            project_name=project_names.get(project_id, ""),
            milestone_id=card.milestone_id,
            milestone_title=milestone_title,
        )
        for card, column_name, board_id, board_name, project_id, milestone_title in cards_result.all()
    ]

    milestones = []
    for project in projects:
        project_metrics = await compute_milestone_metrics(project.id, db)
        m_result = await db.execute(
            select(Milestone)
            .where(Milestone.project_id == project.id)
            .order_by(Milestone.due_date.nulls_last(), Milestone.title)
        )
        for m in m_result.scalars().all():
            metrics = project_metrics.get(m.id, EMPTY_METRICS)
            milestones.append(
                {
                    "id": m.id,
                    "project_id": m.project_id,
                    "title": m.title,
                    "due_date": m.due_date,
                    "description": m.description,
                    "created_at": m.created_at,
                    **metrics,
                }
            )

    return PMOverview(
        projects=[PMProjectOut(id=p.id, org_id=p.org_id, name=p.name) for p in projects],
        cards=cards,
        milestones=milestones,
    )
