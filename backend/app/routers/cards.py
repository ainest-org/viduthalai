from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.board import Board
from app.models.card import Card
from app.models.column import Column
from app.models.column_history import ColumnHistory
from app.models.milestone import Milestone
from app.models.user import User
from app.redis_client import cache_delete
from app.schemas.card import CardOut, CardUpdate, CardWithContext
from app.services.permissions import get_accessible_project_ids

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("", response_model=list[CardWithContext])
async def list_my_cards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CardWithContext]:
    result = await db.execute(
        select(
            Card,
            Column.name.label("column_name"),
            Board.id.label("board_id"),
            Board.name.label("board_name"),
        )
        .join(Column, Card.column_id == Column.id)
        .join(Board, Column.board_id == Board.id)
        .where(Board.owner_id == current_user.id)
        .order_by(Board.name, Column.position, Card.position)
    )
    return [
        CardWithContext(
            id=card.id,
            title=card.title,
            description=card.description,
            due_date=card.due_date,
            priority=card.priority,
            milestone_id=card.milestone_id,
            position=card.position,
            column_id=card.column_id,
            created_at=card.created_at,
            column_name=column_name,
            board_id=board_id,
            board_name=board_name,
        )
        for card, column_name, board_id, board_name in result.all()
    ]


def _board_cache_key(board_id: int) -> str:
    return f"board:{board_id}"


async def _get_owned_card(card_id: int, user: User, db: AsyncSession) -> Card:
    accessible_project_ids = await get_accessible_project_ids(user.id, db)
    conditions = [Board.owner_id == user.id]
    if accessible_project_ids:
        conditions.append(Board.project_id.in_(accessible_project_ids))

    result = await db.execute(
        select(Card)
        .join(Column, Card.column_id == Column.id)
        .join(Board, Column.board_id == Board.id)
        .where(Card.id == card_id, or_(*conditions))
    )
    card = result.scalar_one_or_none()
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
    return card


async def _get_column_board_id(column_id: int, db: AsyncSession) -> int:
    result = await db.execute(select(Column.board_id).where(Column.id == column_id))
    board_id = result.scalar_one_or_none()
    if board_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")
    return board_id


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


@router.patch("/{card_id}", response_model=CardOut)
async def update_card(
    card_id: int,
    payload: CardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Card:
    card = await _get_owned_card(card_id, current_user, db)
    board_id = await _get_column_board_id(card.column_id, db)

    data = payload.model_dump(exclude_unset=True)

    if "title" in data:
        card.title = data["title"]
    if "description" in data:
        card.description = data["description"]
    if "due_date" in data:
        card.due_date = data["due_date"]
    if "priority" in data:
        card.priority = data["priority"]
    if "milestone_id" in data:
        await _validate_milestone(data["milestone_id"], board_id, db)
        card.milestone_id = data["milestone_id"]
    if "position" in data:
        card.position = data["position"]
    if "column_id" in data and data["column_id"] is not None and data["column_id"] != card.column_id:
        new_board_id = await _get_column_board_id(data["column_id"], db)
        if new_board_id != board_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move a card to a column on a different board",
            )
        db.add(
            ColumnHistory(card_id=card.id, from_column_id=card.column_id, to_column_id=data["column_id"])
        )
        card.column_id = data["column_id"]

    await db.commit()
    await db.refresh(card)
    await cache_delete(_board_cache_key(board_id))
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(
    card_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    card = await _get_owned_card(card_id, current_user, db)
    board_id = await _get_column_board_id(card.column_id, db)
    await db.delete(card)
    await db.commit()
    await cache_delete(_board_cache_key(board_id))
