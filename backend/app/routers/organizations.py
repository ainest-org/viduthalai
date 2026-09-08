from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.organization import Organization, OrgMembership
from app.models.project import Project, ProjectManager, ProjectMember
from app.models.user import User
from app.schemas.organization import (
    MemberAdd,
    OrganizationCreate,
    OrganizationOut,
    OrganizationWithRole,
    OrgMemberOut,
)
from app.schemas.project import ProjectCreate, ProjectOut

router = APIRouter(prefix="/organizations", tags=["organizations"])


async def _get_membership(org_id: int, user_id: int, db: AsyncSession) -> OrgMembership | None:
    result = await db.execute(
        select(OrgMembership).where(OrgMembership.org_id == org_id, OrgMembership.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _require_membership(org_id: int, user: User, db: AsyncSession) -> OrgMembership:
    membership = await _get_membership(org_id, user.id, db)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return membership


async def _require_admin(org_id: int, user: User, db: AsyncSession) -> OrgMembership:
    membership = await _require_membership(org_id, user, db)
    if membership.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return membership


@router.post("", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Organization:
    org = Organization(name=payload.name)
    db.add(org)
    await db.flush()
    db.add(OrgMembership(org_id=org.id, user_id=current_user.id, role="admin"))
    await db.commit()
    await db.refresh(org)
    return org


@router.get("", response_model=list[OrganizationWithRole])
async def list_organizations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrganizationWithRole]:
    result = await db.execute(
        select(Organization, OrgMembership.role)
        .join(OrgMembership, OrgMembership.org_id == Organization.id)
        .where(OrgMembership.user_id == current_user.id)
        .order_by(Organization.name)
    )
    return [
        OrganizationWithRole(id=org.id, name=org.name, created_at=org.created_at, role=role)
        for org, role in result.all()
    ]


@router.get("/{org_id}/members", response_model=list[OrgMemberOut])
async def list_members(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrgMemberOut]:
    await _require_membership(org_id, current_user, db)
    result = await db.execute(
        select(OrgMembership.user_id, User.name, User.email, OrgMembership.role)
        .join(User, User.id == OrgMembership.user_id)
        .where(OrgMembership.org_id == org_id)
        .order_by(User.name)
    )
    return [
        OrgMemberOut(user_id=uid, name=name, email=email, role=role)
        for uid, name, email, role in result.all()
    ]


@router.post("/{org_id}/members", response_model=OrgMemberOut, status_code=status.HTTP_201_CREATED)
async def add_member(
    org_id: int,
    payload: MemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgMemberOut:
    await _require_admin(org_id, current_user, db)

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Viduthalai account found with that email",
        )

    existing = await _get_membership(org_id, user.id, db)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    membership = OrgMembership(org_id=org_id, user_id=user.id, role=payload.role)
    db.add(membership)
    await db.commit()
    return OrgMemberOut(user_id=user.id, name=user.name, email=user.email, role=payload.role)


@router.delete("/{org_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    org_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_admin(org_id, current_user, db)
    membership = await _get_membership(org_id, user_id, db)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await db.delete(membership)
    await db.commit()


@router.get("/{org_id}/projects", response_model=list[ProjectOut])
async def list_projects(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    membership = await _require_membership(org_id, current_user, db)

    if membership.role == "admin":
        result = await db.execute(select(Project).where(Project.org_id == org_id).order_by(Project.name))
        return list(result.scalars().all())

    result = await db.execute(
        select(Project)
        .outerjoin(ProjectManager, ProjectManager.project_id == Project.id)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .where(
            Project.org_id == org_id,
            (ProjectManager.user_id == current_user.id) | (ProjectMember.user_id == current_user.id),
        )
        .order_by(Project.name)
        .distinct()
    )
    return list(result.scalars().all())


@router.post("/{org_id}/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    org_id: int,
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    await _require_admin(org_id, current_user, db)
    project = Project(org_id=org_id, name=payload.name)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project
