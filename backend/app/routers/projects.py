from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.board import Board
from app.models.project import ProjectManager, ProjectMember
from app.models.user import User
from app.schemas.board import BoardOut
from app.schemas.organization import ProjectPersonOut
from app.schemas.project import AddPerson, ProjectDetail
from app.services.permissions import (
    find_user_by_email,
    is_project_manager,
    is_project_member,
    require_admin_or_pm,
    require_org_admin_for_project,
    require_project_access,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/{project_id}/boards", response_model=list[BoardOut])
async def list_project_boards(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Board]:
    await require_project_access(project_id, current_user, db)
    result = await db.execute(
        select(Board).where(Board.project_id == project_id).order_by(Board.created_at)
    )
    return list(result.scalars().all())


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
        managers=[ProjectPersonOut(user_id=i, name=n, email=e) for i, n, e in managers_result.all()],
        members=[ProjectPersonOut(user_id=i, name=n, email=e) for i, n, e in members_result.all()],
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
