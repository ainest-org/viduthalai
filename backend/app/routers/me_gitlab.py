from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.gitlab_work import GitLabIssueOut, GitLabMergeRequestOut, GitLabWorkStatus
from app.services.gitlab_client import (
    GitLabClientError,
    list_my_issues,
    list_my_merge_requests,
    project_path_from_item_url,
)
from app.services.gitlab_oauth import GitLabOAuthError, get_valid_user_gitlab_token

router = APIRouter(prefix="/me/gitlab", tags=["me"])


@router.get("/status", response_model=GitLabWorkStatus)
async def gitlab_status(current_user: User = Depends(get_current_user)) -> GitLabWorkStatus:
    return GitLabWorkStatus(
        connected=current_user.encrypted_gitlab_token is not None,
        gitlab_username=current_user.gitlab_username,
    )


@router.get("/merge-requests", response_model=list[GitLabMergeRequestOut])
async def my_merge_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GitLabMergeRequestOut]:
    if current_user.gitlab_connection is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not signed in with GitLab")

    try:
        access_token = await get_valid_user_gitlab_token(current_user, db)
        mrs = await list_my_merge_requests(current_user.gitlab_connection.base_url, access_token)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [
        GitLabMergeRequestOut(
            iid=mr["iid"],
            title=mr["title"],
            web_url=mr["web_url"],
            state=mr["state"],
            project_name=project_path_from_item_url(mr["web_url"]),
            source_branch=mr.get("source_branch"),
            target_branch=mr.get("target_branch"),
            updated_at=mr.get("updated_at"),
        )
        for mr in mrs
    ]


@router.get("/issues", response_model=list[GitLabIssueOut])
async def my_issues(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GitLabIssueOut]:
    if current_user.gitlab_connection is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not signed in with GitLab")

    try:
        access_token = await get_valid_user_gitlab_token(current_user, db)
        issues = await list_my_issues(current_user.gitlab_connection.base_url, access_token)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [
        GitLabIssueOut(
            iid=issue["iid"],
            title=issue["title"],
            web_url=issue["web_url"],
            state=issue["state"],
            project_name=project_path_from_item_url(issue["web_url"]),
            updated_at=issue.get("updated_at"),
        )
        for issue in issues
    ]
