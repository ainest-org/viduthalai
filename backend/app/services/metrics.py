from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import Board
from app.models.card import Card
from app.models.column import Column
from app.models.column_history import ColumnHistory

MilestoneMetricsDict = dict[str, int | float | None]

EMPTY_METRICS: MilestoneMetricsDict = {
    "total_cards": 0,
    "completed_cards": 0,
    "completion_pct": 0.0,
    "overdue_count": 0,
    "avg_cycle_time_hours": None,
}


async def compute_milestone_metrics(project_id: int, db: AsyncSession) -> dict[int, MilestoneMetricsDict]:
    """Per-milestone completion/overdue/cycle-time stats for every milestone with at least one card.

    "Complete" is approximated as: the card currently sits in the column with the
    highest position on its board (the rightmost column) — there's no explicit
    is-done flag on columns yet.
    """
    max_position_result = await db.execute(
        select(Column.board_id, func.max(Column.position))
        .join(Board, Board.id == Column.board_id)
        .where(Board.project_id == project_id)
        .group_by(Column.board_id)
    )
    max_position_by_board = dict(max_position_result.all())

    cards_result = await db.execute(
        select(
            Card.id,
            Card.milestone_id,
            Card.due_date,
            Card.created_at,
            Column.position,
            Column.board_id,
        )
        .join(Column, Column.id == Card.column_id)
        .join(Board, Board.id == Column.board_id)
        .where(Board.project_id == project_id, Card.milestone_id.isnot(None))
    )
    rows = cards_result.all()

    today = date.today()
    by_milestone: dict[int, list[dict]] = defaultdict(list)
    completed_card_ids: list[int] = []

    for card_id, milestone_id, due_date, created_at, position, board_id in rows:
        is_complete = position == max_position_by_board.get(board_id)
        is_overdue = due_date is not None and due_date < today
        by_milestone[milestone_id].append(
            {
                "card_id": card_id,
                "created_at": created_at,
                "is_complete": is_complete,
                "is_overdue": is_overdue,
            }
        )
        if is_complete:
            completed_card_ids.append(card_id)

    entered_final_at: dict[int, datetime] = {}
    if completed_card_ids:
        hist_result = await db.execute(
            select(ColumnHistory.card_id, func.max(ColumnHistory.changed_at))
            .where(ColumnHistory.card_id.in_(completed_card_ids))
            .group_by(ColumnHistory.card_id)
        )
        entered_final_at = dict(hist_result.all())

    metrics: dict[int, MilestoneMetricsDict] = {}
    for milestone_id, cards in by_milestone.items():
        total = len(cards)
        completed = sum(1 for c in cards if c["is_complete"])
        overdue = sum(1 for c in cards if c["is_overdue"])

        cycle_times: list[float] = []
        for c in cards:
            entered_at = entered_final_at.get(c["card_id"])
            if c["is_complete"] and entered_at is not None:
                cycle_times.append((entered_at - c["created_at"]).total_seconds() / 3600)

        metrics[milestone_id] = {
            "total_cards": total,
            "completed_cards": completed,
            "completion_pct": round(completed / total * 100, 1) if total else 0.0,
            "overdue_count": overdue,
            "avg_cycle_time_hours": round(sum(cycle_times) / len(cycle_times), 1) if cycle_times else None,
        }

    return metrics
