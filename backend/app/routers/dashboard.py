from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.gitlab_connection import GitLabConnection
from app.models.organization import Organization
from app.models.project import Project
from app.models.user import User
from app.routers.gitlab import _get_connection
from app.schemas.dashboard import DashboardProjectOut
from app.schemas.gitlab_admin import GitLabProjectIssueOut, GitLabProjectMergeRequestOut
from app.services.gitlab_client import GitLabClientError, list_project_issues, list_project_merge_requests
from app.services.gitlab_oauth import GitLabOAuthError, get_valid_access_token
from app.services.permissions import get_accessible_project_ids

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/projects", response_model=list[DashboardProjectOut])
async def list_dashboard_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DashboardProjectOut]:
    project_ids = await get_accessible_project_ids(current_user.id, db)
    if not project_ids:
        return []

    result = await db.execute(
        select(Project, Organization.name)
        .join(Organization, Organization.id == Project.org_id)
        .where(Project.id.in_(project_ids))
        .order_by(Project.name)
    )
    rows = result.all()

    connections: dict[int, GitLabConnection | None] = {}
    tokens: dict[int, str] = {}
    out: list[DashboardProjectOut] = []

    for project, org_name in rows:
        merge_requests: list[GitLabProjectMergeRequestOut] = []
        issues: list[GitLabProjectIssueOut] = []
        gitlab_error: str | None = None

        if project.gitlab_project_id is None:
            gitlab_error = "Not linked to a repo"
        else:
            if project.org_id not in connections:
                connections[project.org_id] = await _get_connection(project.org_id, db)
            connection = connections[project.org_id]

            if connection is None or connection.encrypted_token is None:
                gitlab_error = "GitLab not connected"
            else:
                try:
                    if project.org_id not in tokens:
                        tokens[project.org_id] = await get_valid_access_token(connection, db)
                    token = tokens[project.org_id]
                    mrs = await list_project_merge_requests(connection.base_url, token, project.gitlab_project_id)
                    raw_issues = await list_project_issues(connection.base_url, token, project.gitlab_project_id)
                    merge_requests = [
                        GitLabProjectMergeRequestOut(
                            iid=mr["iid"],
                            title=mr["title"],
                            web_url=mr["web_url"],
                            state=mr["state"],
                            author_username=(mr.get("author") or {}).get("username"),
                            source_branch=mr["source_branch"],
                            target_branch=mr["target_branch"],
                            updated_at=mr.get("updated_at"),
                        )
                        for mr in mrs
                    ]
                    issues = [
                        GitLabProjectIssueOut(
                            iid=issue["iid"],
                            title=issue["title"],
                            web_url=issue["web_url"],
                            state=issue["state"],
                            author_username=(issue.get("author") or {}).get("username"),
                            updated_at=issue.get("updated_at"),
                        )
                        for issue in raw_issues
                    ]
                except (GitLabOAuthError, GitLabClientError) as exc:
                    gitlab_error = str(exc)

        out.append(
            DashboardProjectOut(
                id=project.id,
                org_id=project.org_id,
                org_name=org_name,
                name=project.name,
                created_at=project.created_at,
                gitlab_project_id=project.gitlab_project_id,
                gitlab_project_path=project.gitlab_project_path,
                gitlab_web_url=project.gitlab_web_url,
                gitlab_error=gitlab_error,
                merge_requests=merge_requests,
                issues=issues,
            )
        )

    return out
