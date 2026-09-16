from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.organization import OrgMembership
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

    gitlab_connected, gitlab_items = await _gitlab_items_by_username(org_id, db)

    developers: list[DeveloperWorkload] = []
    for user, role in members:
        items = list(gitlab_items.pop(user.gitlab_username, [])) if user.gitlab_username else []
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
