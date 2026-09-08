from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.board import Board
from app.models.card import Card
from app.models.column import Column
from app.models.column_history import ColumnHistory
from app.models.milestone import Milestone
from app.models.user import User
from app.redis_client import cache_delete
from app.schemas.card import CardCreate, CardOut
from app.schemas.column import ColumnOut, ColumnUpdate
from app.services.permissions import get_accessible_project_ids

router = APIRouter(prefix="/columns", tags=["columns"])


def _board_cache_key(board_id: int) -> str:
    return f"board:{board_id}"


async def _validate_milestone(milestone_id: int | None, board_id: int, db: AsyncSession) -> None:
    if milestone_id is None:
        return
    board = await db.get(Board, board_id)
    if board is None or board.project_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Board is not part of a project"
        )
    milestone = await db.get(Milestone, milestone_id)
    if milestone is None or milestone.project_id != board.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Milestone does not belong to this board's project",
        )


async def _get_owned_column(column_id: int, user: User, db: AsyncSession) -> Column:
    accessible_project_ids = await get_accessible_project_ids(user.id, db)
    conditions = [Board.owner_id == user.id]
    if accessible_project_ids:
        conditions.append(Board.project_id.in_(accessible_project_ids))

    result = await db.execute(
        select(Column)
        .join(Board, Column.board_id == Board.id)
        .options(selectinload(Column.cards))
        .where(Column.id == column_id, or_(*conditions))
    )
    column = result.scalar_one_or_none()
    if column is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")
    return column


@router.patch("/{column_id}", response_model=ColumnOut)
async def update_column(
    column_id: int,
    payload: ColumnUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Column:
    column = await _get_owned_column(column_id, current_user, db)

    if payload.name is not None:
        column.name = payload.name
    if payload.position is not None:
        column.position = payload.position

    await db.commit()
    await db.refresh(column)
    await cache_delete(_board_cache_key(column.board_id))
    return column


@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_column(
    column_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    column = await _get_owned_column(column_id, current_user, db)
    board_id = column.board_id
    await db.delete(column)
    await db.commit()
    await cache_delete(_board_cache_key(board_id))


@router.post("/{column_id}/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED)
async def create_card(
    column_id: int,
    payload: CardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    column = await _get_owned_column(column_id, current_user, db)
    await _validate_milestone(payload.milestone_id, column.board_id, db)

    max_position = max((c.position for c in column.cards), default=-1)
    card = Card(
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        priority=payload.priority,
        milestone_id=payload.milestone_id,
        column_id=column.id,
        position=max_position + 1,
    )
    db.add(card)
    await db.flush()
    db.add(ColumnHistory(card_id=card.id, from_column_id=None, to_column_id=column.id))
    await db.commit()
    await db.refresh(card)
    await cache_delete(_board_cache_key(column.board_id))
    return card
