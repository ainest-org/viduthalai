from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.board import Board
from app.models.card import Card
from app.models.card_link import CardLink
from app.models.column import Column
from app.models.mr_assignee import MRAssignee
from app.models.organization import OrgMembership
from app.models.project import Project
from app.models.user import User
from app.routers.gitlab import _get_connection, _require_org_admin
from app.schemas.team_workload import DeveloperWorkload, TeamWorkloadOut, WorkItemOut
from app.services.gitlab_client import (
    GitLabClientError,
    list_project_issues,
    list_project_merge_requests,
    list_projects,
)
from app.services.gitlab_oauth import GitLabOAuthError, get_valid_access_token

router = APIRouter(prefix="/organizations/{org_id}", tags=["team-workload"])


async def _internal_items_by_user(project_ids: list[int], db: AsyncSession) -> dict[int, list[WorkItemOut]]:
    """Viduthalai's own MR assignments (Phase 5) for cards within this org's projects."""
    items_by_user: dict[int, list[WorkItemOut]] = {}
    if not project_ids:
        return items_by_user

    rows = await db.execute(
        select(
            MRAssignee.user_id,
            CardLink.title,
            CardLink.mr_url,
            CardLink.state,
            CardLink.project_path,
        )
        .join(CardLink, MRAssignee.card_link_id == CardLink.id)
        .join(Card, CardLink.card_id == Card.id)
        .join(Column, Card.column_id == Column.id)
        .join(Board, Column.board_id == Board.id)
        .where(Board.project_id.in_(project_ids))
    )
    for user_id, title, mr_url, state, project_path in rows.all():
        items_by_user.setdefault(user_id, []).append(
            WorkItemOut(
                type="merge_request", title=title, web_url=mr_url, state=state,
                project_name=project_path, source="viduthalai",
            )
        )
    return items_by_user


async def _gitlab_items_by_username(org_id: int, db: AsyncSession) -> tuple[bool, dict[str, list[WorkItemOut]]]:
    """Every open MR/issue assignee across every repo this org's GitLab connection can see."""
    items_by_username: dict[str, list[WorkItemOut]] = {}
    connection = await _get_connection(org_id, db)
    if connection is None or connection.encrypted_token is None:
        return False, items_by_username

    try:
        token = await get_valid_access_token(connection, db)
        projects = await list_projects(connection.base_url, token)
    except (GitLabOAuthError, GitLabClientError):
        return True, items_by_username

    for project in projects:
        project_name = project.get("path_with_namespace")
        try:
            mrs = await list_project_merge_requests(connection.base_url, token, project["id"])
            issues = await list_project_issues(connection.base_url, token, project["id"])
        except GitLabClientError:
            continue

        for mr in mrs:
            for assignee in mr.get("assignees") or []:
                items_by_username.setdefault(assignee["username"], []).append(
                    WorkItemOut(
                        type="merge_request", title=mr["title"], web_url=mr["web_url"],
                        state=mr["state"], project_name=project_name, source="gitlab",
                    )
                )
        for issue in issues:
            for assignee in issue.get("assignees") or []:
                items_by_username.setdefault(assignee["username"], []).append(
                    WorkItemOut(
                        type="issue", title=issue["title"], web_url=issue["web_url"],
                        state=issue["state"], project_name=project_name, source="gitlab",
                    )
                )

    return True, items_by_username


@router.get("/team-workload", response_model=TeamWorkloadOut)
async def get_team_workload(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TeamWorkloadOut:
    await _require_org_admin(org_id, current_user, db)

    members_result = await db.execute(
        select(User, OrgMembership.role)
        .join(OrgMembership, OrgMembership.user_id == User.id)
        .where(OrgMembership.org_id == org_id)
        .order_by(User.name)
    )
    members = members_result.all()

    project_ids_result = await db.execute(select(Project.id).where(Project.org_id == org_id))
    project_ids = [row[0] for row in project_ids_result.all()]

    internal_items = await _internal_items_by_user(project_ids, db)
    gitlab_connected, gitlab_items = await _gitlab_items_by_username(org_id, db)

    developers: list[DeveloperWorkload] = []
    for user, role in members:
        items = list(internal_items.get(user.id, []))
        if user.gitlab_username and user.gitlab_username in gitlab_items:
            items.extend(gitlab_items.pop(user.gitlab_username))
        developers.append(
            DeveloperWorkload(
                source="viduthalai",
                user_id=user.id,
                name=user.name,
                email=user.email,
                gitlab_username=user.gitlab_username,
                role=role,
                items=items,
            )
        )

    for username, items in gitlab_items.items():
        developers.append(
            DeveloperWorkload(
                source="gitlab_only",
                name=username,
                gitlab_username=username,
                items=items,
            )
        )

    return TeamWorkloadOut(gitlab_connected=gitlab_connected, developers=developers)
