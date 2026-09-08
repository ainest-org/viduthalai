import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.card import Card
from app.models.card_link import CardLink
from app.models.column import Column
from app.models.webhook_event import WebhookEvent
from app.redis_client import cache_delete


def process_webhook_event(event_id: int) -> None:
    """RQ entrypoint — RQ calls sync functions, so we run the async handler in a fresh loop."""
    asyncio.run(_process(event_id))


async def _process(event_id: int) -> None:
    async with async_session_maker() as db:
        event = await db.get(WebhookEvent, event_id)
        if event is None or event.processed:
            return
        try:
            await _apply_event(event, db)
            event.processed = True
        except Exception as exc:  # noqa: BLE001 — persist any failure onto the event row instead of losing it
            event.error = str(exc)[:2000]
        await db.commit()


async def _apply_event(event: WebhookEvent, db: AsyncSession) -> None:
    if event.event_type != "merge_request":
        return

    payload = event.payload
    attrs = payload.get("object_attributes", {})
    project = payload.get("project", {})
    project_path = project.get("path_with_namespace")
    mr_iid = attrs.get("iid")
    if not project_path or mr_iid is None:
        return

    result = await db.execute(
        select(CardLink).where(CardLink.project_path == project_path, CardLink.mr_iid == mr_iid)
    )
    links = result.scalars().all()
    if not links:
        return  # no card is tracking this MR

    board_ids: set[int] = set()
    for link in links:
        link.title = attrs.get("title", link.title)
        link.state = attrs.get("state", link.state)
        link.source_branch = attrs.get("source_branch", link.source_branch)
        link.target_branch = attrs.get("target_branch", link.target_branch)
        link.mr_url = attrs.get("url", link.mr_url)

        card = await db.get(Card, link.card_id)
        if card is not None:
            board_id = await db.scalar(select(Column.board_id).where(Column.id == card.column_id))
            if board_id is not None:
                board_ids.add(board_id)

    if board_ids:
        await cache_delete(*[f"board:{board_id}" for board_id in board_ids])
