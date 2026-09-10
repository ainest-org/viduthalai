from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import OrgMembership
from app.models.project import Project, ProjectManager, ProjectMember
from app.models.user import User


async def get_accessible_project_ids(user_id: int, db: AsyncSession) -> list[int]:
    """Every project this user can see: org admin, project manager, or project member."""
    admin_orgs = await db.execute(
        select(OrgMembership.org_id).where(
            OrgMembership.user_id == user_id, OrgMembership.role == "admin"
        )
    )
    admin_org_ids = [row[0] for row in admin_orgs.all()]

    project_ids: set[int] = set()
    if admin_org_ids:
        admin_projects = await db.execute(select(Project.id).where(Project.org_id.in_(admin_org_ids)))
        project_ids.update(row[0] for row in admin_projects.all())

    managed = await db.execute(
        select(ProjectManager.project_id).where(ProjectManager.user_id == user_id)
    )
    project_ids.update(row[0] for row in managed.all())

    member_of = await db.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    )
    project_ids.update(row[0] for row in member_of.all())

    return list(project_ids)


async def get_org_role(org_id: int, user_id: int, db: AsyncSession) -> str | None:
    result = await db.execute(
        select(OrgMembership.role).where(OrgMembership.org_id == org_id, OrgMembership.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def is_project_manager(project_id: int, user_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(ProjectManager.id).where(
            ProjectManager.project_id == project_id, ProjectManager.user_id == user_id
        )
    )
    return result.scalar_one_or_none() is not None


async def is_project_member(project_id: int, user_id: int, db: AsyncSession) -> bool:
    result = await db.execute(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    return result.scalar_one_or_none() is not None


async def get_project_or_404(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def require_project_access(project_id: int, user: User, db: AsyncSession) -> Project:
    project = await get_project_or_404(project_id, db)
    org_role = await get_org_role(project.org_id, user.id, db)
    if org_role == "admin":
        return project
    if await is_project_manager(project_id, user.id, db):
        return project
    if await is_project_member(project_id, user.id, db):
        return project
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")


async def require_admin_or_pm(project_id: int, user: User, db: AsyncSession) -> Project:
    project = await get_project_or_404(project_id, db)
    org_role = await get_org_role(project.org_id, user.id, db)
    if org_role == "admin":
        return project
    if await is_project_manager(project_id, user.id, db):
        return project
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required")


async def require_org_admin_for_project(project_id: int, user: User, db: AsyncSession) -> Project:
    project = await get_project_or_404(project_id, db)
    org_role = await get_org_role(project.org_id, user.id, db)
    if org_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return project


async def get_project_people(project_id: int, db: AsyncSession) -> list[User]:
    """Everyone who can access this project — org admins, managers, and members —
    the pool assignable to its cards' linked merge requests."""
    project = await get_project_or_404(project_id, db)

    admin_ids = await db.execute(
        select(OrgMembership.user_id).where(
            OrgMembership.org_id == project.org_id, OrgMembership.role == "admin"
        )
    )
    manager_ids = await db.execute(select(ProjectManager.user_id).where(ProjectManager.project_id == project_id))
    member_ids = await db.execute(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id))

    user_ids = (
        {row[0] for row in admin_ids.all()}
        | {row[0] for row in manager_ids.all()}
        | {row[0] for row in member_ids.all()}
    )
    if not user_ids:
        return []

    result = await db.execute(select(User).where(User.id.in_(user_ids)).order_by(User.name))
    return list(result.scalars().all())


async def find_user_by_email(email: str, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Viduthalai account found with that email",
        )
    return user
