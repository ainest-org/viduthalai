from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.project import ProjectManager, ProjectMember
from app.models.user import User
from app.routers.gitlab import _get_connection
from app.schemas.gitlab_admin import GitLabProjectIssueOut, GitLabProjectMergeRequestOut, ProjectWorkItemsOut
from app.schemas.organization import ProjectPersonOut
from app.schemas.project import AddPerson, ProjectDetail
from app.services.gitlab_client import GitLabClientError, list_project_issues, list_project_merge_requests
from app.services.gitlab_oauth import GitLabOAuthError, get_valid_access_token
from app.services.permissions import (
    find_user_by_email,
    is_project_manager,
    is_project_member,
    require_admin_or_pm,
    require_org_admin_for_project,
    require_project_access,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectDetail:
    project = await require_project_access(project_id, current_user, db)

    managers_result = await db.execute(
        select(User.id, User.name, User.email)
        .join(ProjectManager, ProjectManager.user_id == User.id)
        .where(ProjectManager.project_id == project_id)
        .order_by(User.name)
    )
    members_result = await db.execute(
        select(User.id, User.name, User.email)
        .join(ProjectMember, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(User.name)
    )

    return ProjectDetail(
        id=project.id,
        org_id=project.org_id,
        name=project.name,
        created_at=project.created_at,
        gitlab_project_id=project.gitlab_project_id,
        gitlab_project_path=project.gitlab_project_path,
        gitlab_web_url=project.gitlab_web_url,
        gitlab_default_branch=project.gitlab_default_branch,
        managers=[ProjectPersonOut(user_id=i, name=n, email=e) for i, n, e in managers_result.all()],
        members=[ProjectPersonOut(user_id=i, name=n, email=e) for i, n, e in members_result.all()],
    )


@router.get("/{project_id}/work-items", response_model=ProjectWorkItemsOut)
async def get_project_work_items(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectWorkItemsOut:
    project = await require_project_access(project_id, current_user, db)

    if project.gitlab_project_id is None:
        return ProjectWorkItemsOut(merge_requests=[], issues=[])

    connection = await _get_connection(project.org_id, db)
    if connection is None or connection.encrypted_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="GitLab isn't connected for this organization"
        )

    try:
        token = await get_valid_access_token(connection, db)
        mrs = await list_project_merge_requests(connection.base_url, token, project.gitlab_project_id)
        issues = await list_project_issues(connection.base_url, token, project.gitlab_project_id)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return ProjectWorkItemsOut(
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


@router.post("/{project_id}/managers", response_model=ProjectPersonOut, status_code=status.HTTP_201_CREATED)
async def add_manager(
    project_id: int,
    payload: AddPerson,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectPersonOut:
    await require_org_admin_for_project(project_id, current_user, db)
    user = await find_user_by_email(payload.email, db)

    if await is_project_manager(project_id, user.id, db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a manager")

    db.add(ProjectManager(project_id=project_id, user_id=user.id))
    await db.commit()
    return ProjectPersonOut(user_id=user.id, name=user.name, email=user.email)


@router.delete("/{project_id}/managers/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_manager(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_org_admin_for_project(project_id, current_user, db)
    result = await db.execute(
        select(ProjectManager).where(
            ProjectManager.project_id == project_id, ProjectManager.user_id == user_id
        )
    )
    manager = result.scalar_one_or_none()
    if manager is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manager not found")
    await db.delete(manager)
    await db.commit()


@router.post("/{project_id}/members", response_model=ProjectPersonOut, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: int,
    payload: AddPerson,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectPersonOut:
    await require_admin_or_pm(project_id, current_user, db)
    user = await find_user_by_email(payload.email, db)

    if await is_project_member(project_id, user.id, db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    db.add(ProjectMember(project_id=project_id, user_id=user.id))
    await db.commit()
    return ProjectPersonOut(user_id=user.id, name=user.name, email=user.email)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_admin_or_pm(project_id, current_user, db)
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await db.delete(member)
    await db.commit()
