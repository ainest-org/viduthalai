from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.board import Board
from app.models.card import Card
from app.models.card_link import CardLink
from app.models.column import Column
from app.models.gitlab_connection import GitLabConnection
from app.models.project import Project
from app.models.user import User
from app.redis_client import cache_delete
from app.routers.cards import _get_owned_card
from app.schemas.card_link import CardLinkCreate, CardLinkOut
from app.services.gitlab_client import GitLabClientError, get_merge_request, parse_mr_url
from app.services.gitlab_oauth import GitLabOAuthError, get_valid_access_token

router = APIRouter(tags=["card-links"])


def _board_cache_key(board_id: int) -> str:
    return f"board:{board_id}"


async def _get_gitlab_connection_for_card(card: Card, db: AsyncSession) -> GitLabConnection:
    project_id = await db.scalar(
        select(Board.project_id).join(Column, Column.board_id == Board.id).where(Column.id == card.column_id)
    )
    if project_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This card's board isn't linked to a project, so it has no GitLab connection",
        )
    project = await db.get(Project, project_id)
    result = await db.execute(select(GitLabConnection).where(GitLabConnection.org_id == project.org_id))
    connection = result.scalar_one_or_none()
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This project's organization hasn't connected GitLab yet",
        )
    return connection


@router.get("/cards/{card_id}/links", response_model=list[CardLinkOut])
async def list_card_links(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CardLink]:
    card = await _get_owned_card(card_id, current_user, db)
    result = await db.execute(select(CardLink).where(CardLink.card_id == card.id).order_by(CardLink.created_at))
    return list(result.scalars().all())


@router.post("/cards/{card_id}/links", response_model=CardLinkOut, status_code=status.HTTP_201_CREATED)
async def create_card_link(
    card_id: int,
    payload: CardLinkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CardLink:
    card = await _get_owned_card(card_id, current_user, db)
    connection = await _get_gitlab_connection_for_card(card, db)

    try:
        _, project_path, mr_iid = parse_mr_url(payload.mr_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    existing = await db.execute(
        select(CardLink).where(
            CardLink.card_id == card.id, CardLink.project_path == project_path, CardLink.mr_iid == mr_iid
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already linked to this card")

    try:
        access_token = await get_valid_access_token(connection, db)
        mr = await get_merge_request(connection.base_url, access_token, project_path, mr_iid)
    except (GitLabOAuthError, GitLabClientError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    link = CardLink(
        card_id=card.id,
        project_path=project_path,
        gitlab_project_id=mr.get("project_id"),
        mr_iid=mr_iid,
        mr_url=mr.get("web_url", payload.mr_url),
        title=mr.get("title", ""),
        state=mr.get("state", "opened"),
        source_branch=mr.get("source_branch"),
        target_branch=mr.get("target_branch"),
        author_username=(mr.get("author") or {}).get("username"),
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    board_id = await db.scalar(select(Column.board_id).where(Column.id == card.column_id))
    if board_id is not None:
        await cache_delete(_board_cache_key(board_id))

    return link


@router.delete("/card-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card_link(
    link_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    link = await db.get(CardLink, link_id)
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    card = await _get_owned_card(link.card_id, current_user, db)
    board_id = await db.scalar(select(Column.board_id).where(Column.id == card.column_id))

    await db.delete(link)
    await db.commit()
    if board_id is not None:
        await cache_delete(_board_cache_key(board_id))
