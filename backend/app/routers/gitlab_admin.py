from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.gitlab_connection import GitLabConnection
from app.models.user import User
from app.routers.gitlab import _get_connection, _require_org_admin
from app.schemas.gitlab_admin import (
    GitLabBranchOut,
    GitLabProjectDetail,
    GitLabProjectIssueOut,
    GitLabProjectMergeRequestOut,
    GitLabProjectSummary,
)
from app.services.gitlab_client import (
    GitLabClientError,
    get_project,
    list_branches,
    list_project_issues,
    list_project_merge_requests,
    list_projects,
)
from app.services.gitlab_oauth import GitLabOAuthError, get_valid_access_token

router = APIRouter(prefix="/organizations/{org_id}/gitlab", tags=["gitlab-admin"])


async def _get_connected_connection(org_id: int, user: User, db: AsyncSession) -> GitLabConnection:
    await _require_org_admin(org_id, user, db)
    connection = await _get_connection(org_id, db)
    if connection is None or connection.encrypted_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="GitLab isn't connected for this organization"
        )
    return connection


@router.get("/projects", response_model=list[GitLabProjectSummary])
async def list_gitlab_projects(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GitLabProjectSummary]:
    connection = await _get_connected_connection(org_id, current_user, db)
    try:
        token = await get_valid_access_token(connection, db)
        projects = await list_projects(connection.base_url, token)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [GitLabProjectSummary.model_validate(p) for p in projects]


@router.get("/projects/{project_id}", response_model=GitLabProjectDetail)
async def get_gitlab_project(
    org_id: int,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GitLabProjectDetail:
    connection = await _get_connected_connection(org_id, current_user, db)
    try:
        token = await get_valid_access_token(connection, db)
        project = await get_project(connection.base_url, token, project_id)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return GitLabProjectDetail.model_validate(project)


@router.get("/projects/{project_id}/branches", response_model=list[GitLabBranchOut])
async def list_gitlab_branches(
    org_id: int,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GitLabBranchOut]:
    connection = await _get_connected_connection(org_id, current_user, db)
    try:
        token = await get_valid_access_token(connection, db)
        branches = await list_branches(connection.base_url, token, project_id)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [
        GitLabBranchOut(
            name=b["name"],
            default=b.get("default", False),
            protected=b.get("protected", False),
            merged=b.get("merged", False),
            web_url=b.get("web_url"),
            last_commit_message=(b.get("commit") or {}).get("message"),
            last_commit_at=(b.get("commit") or {}).get("committed_date"),
        )
        for b in branches
    ]


@router.get("/projects/{project_id}/merge-requests", response_model=list[GitLabProjectMergeRequestOut])
async def list_gitlab_project_merge_requests(
    org_id: int,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GitLabProjectMergeRequestOut]:
    connection = await _get_connected_connection(org_id, current_user, db)
    try:
        token = await get_valid_access_token(connection, db)
        mrs = await list_project_merge_requests(connection.base_url, token, project_id)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [
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


@router.get("/projects/{project_id}/issues", response_model=list[GitLabProjectIssueOut])
async def list_gitlab_project_issues(
    org_id: int,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GitLabProjectIssueOut]:
    connection = await _get_connected_connection(org_id, current_user, db)
    try:
        token = await get_valid_access_token(connection, db)
        issues = await list_project_issues(connection.base_url, token, project_id)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [
        GitLabProjectIssueOut(
            iid=issue["iid"],
            title=issue["title"],
            web_url=issue["web_url"],
            state=issue["state"],
            author_username=(issue.get("author") or {}).get("username"),
            updated_at=issue.get("updated_at"),
        )
        for issue in issues
    ]
