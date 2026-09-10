from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.gitlab_admin import GitLabBranchOut, GitLabProjectIssueOut, GitLabProjectMergeRequestOut
from app.schemas.gitlab_work import (
    GitLabElevatedAccess,
    GitLabElevatedRepo,
    GitLabIssueOut,
    GitLabMergeRequestOut,
    GitLabWorkStatus,
)
from app.services.gitlab_client import (
    MAINTAINER_ACCESS_LEVEL,
    GitLabClientError,
    get_current_user as fetch_gitlab_user,
    list_branches,
    list_my_issues,
    list_my_merge_requests,
    list_project_issues,
    list_project_merge_requests,
    list_projects,
    project_access_level,
    project_access_role_name,
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


@router.get("/elevated-access", response_model=GitLabElevatedAccess)
async def my_elevated_access(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GitLabElevatedAccess:
    """Repos where this GitLab identity is a Maintainer, Owner, or a GitLab instance admin —
    with full branch/MR/issue detail, for the personal "elevated access" panel."""
    if current_user.gitlab_connection is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not signed in with GitLab")

    base_url = current_user.gitlab_connection.base_url
    try:
        access_token = await get_valid_user_gitlab_token(current_user, db)
        gitlab_user = await fetch_gitlab_user(base_url, access_token)
        projects = await list_projects(base_url, access_token)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    is_instance_admin = bool(gitlab_user.get("is_admin"))

    qualifying = [
        project
        for project in projects
        if is_instance_admin or (project_access_level(project) or 0) >= MAINTAINER_ACCESS_LEVEL
    ]

    repos: list[GitLabElevatedRepo] = []
    for project in qualifying:
        project_id = project["id"]
        try:
            branches = await list_branches(base_url, access_token, project_id)
            mrs = await list_project_merge_requests(base_url, access_token, project_id)
            issues = await list_project_issues(base_url, access_token, project_id)
        except GitLabClientError:
            continue

        role = project_access_role_name(project) or ("Admin" if is_instance_admin else "Maintainer")

        repos.append(
            GitLabElevatedRepo(
                id=project_id,
                name=project["name"],
                path_with_namespace=project["path_with_namespace"],
                web_url=project["web_url"],
                default_branch=project.get("default_branch"),
                role=role,
                branches=[
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
                ],
                merge_requests=[
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
                ],
                issues=[
                    GitLabProjectIssueOut(
                        iid=issue["iid"],
                        title=issue["title"],
                        web_url=issue["web_url"],
                        state=issue["state"],
                        author_username=(issue.get("author") or {}).get("username"),
                        updated_at=issue.get("updated_at"),
                    )
                    for issue in issues
                ],
            )
        )

    return GitLabElevatedAccess(is_instance_admin=is_instance_admin, repos=repos)
