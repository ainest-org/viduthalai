from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.board import Board
from app.models.column import Column
from app.models.user import User
from app.redis_client import cache_delete, cache_get, cache_set
from app.schemas.board import BoardCreate, BoardDetail, BoardOut, BoardUpdate
from app.schemas.column import ColumnCreate, ColumnOut
from app.services.permissions import get_accessible_project_ids, require_admin_or_pm

router = APIRouter(prefix="/boards", tags=["boards"])


def _board_cache_key(board_id: int) -> str:
    return f"board:{board_id}"


async def _get_viewable_board(board_id: int, user: User, db: AsyncSession) -> Board:
    """Owner, or anyone with access to the project this board belongs to."""
    accessible_project_ids = await get_accessible_project_ids(user.id, db)
    conditions = [Board.owner_id == user.id]
    if accessible_project_ids:
        conditions.append(Board.project_id.in_(accessible_project_ids))

    result = await db.execute(
        select(Board)
        .options(selectinload(Board.columns).selectinload(Column.cards))
        .where(Board.id == board_id, or_(*conditions))
    )
    board = result.scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return board


async def _get_owned_board(board_id: int, user: User, db: AsyncSession) -> Board:
    """Strict owner check — for renaming, re-assigning, or deleting a board."""
    result = await db.execute(
        select(Board)
        .options(selectinload(Board.columns).selectinload(Column.cards))
        .where(Board.id == board_id, Board.owner_id == user.id)
    )
    board = result.scalar_one_or_none()
    if board is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    return board


@router.get("", response_model=list[BoardOut])
async def list_boards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Board]:
    result = await db.execute(
        select(Board).where(Board.owner_id == current_user.id).order_by(Board.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=BoardOut, status_code=status.HTTP_201_CREATED)
async def create_board(
    payload: BoardCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Board:
    if payload.project_id is not None:
        await require_admin_or_pm(payload.project_id, current_user, db)

    board = Board(name=payload.name, owner_id=current_user.id, project_id=payload.project_id)
    db.add(board)
    await db.commit()
    await db.refresh(board)
    return board


@router.get("/{board_id}", response_model=BoardDetail)
async def get_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BoardDetail:
    cache_key = _board_cache_key(board_id)
    cached = await cache_get(cache_key)
    if cached is not None and cached.get("_owner_id") == current_user.id:
        cached.pop("_owner_id", None)
        return BoardDetail.model_validate(cached)

    board = await _get_viewable_board(board_id, current_user, db)
    detail = BoardDetail.model_validate(board)

    to_cache = detail.model_dump(mode="json")
    to_cache["_owner_id"] = current_user.id
    await cache_set(cache_key, to_cache, ttl_seconds=30)

    return detail


@router.patch("/{board_id}", response_model=BoardOut)
async def update_board(
    board_id: int,
    payload: BoardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Board:
    board = await _get_owned_board(board_id, current_user, db)

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        board.name = data["name"]
    if "project_id" in data:
        if data["project_id"] is not None:
            await require_admin_or_pm(data["project_id"], current_user, db)
        board.project_id = data["project_id"]

    await db.commit()
    await db.refresh(board)
    await cache_delete(_board_cache_key(board_id))
    return board


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    board = await _get_owned_board(board_id, current_user, db)
    await db.delete(board)
    await db.commit()
    await cache_delete(_board_cache_key(board_id))


@router.post("/{board_id}/columns", response_model=ColumnOut, status_code=status.HTTP_201_CREATED)
async def create_column(
    board_id: int,
    payload: ColumnCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Column:
    board = await _get_viewable_board(board_id, current_user, db)

    max_position = max((c.position for c in board.columns), default=-1)
    column = Column(name=payload.name, board_id=board.id, position=max_position + 1)
    db.add(column)
    await db.commit()
    await db.refresh(column)
    await cache_delete(_board_cache_key(board_id))
    return column
