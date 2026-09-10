from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def notify(db: AsyncSession, user_id: int, type_: str, message: str, link: str | None = None) -> None:
    db.add(Notification(user_id=user_id, type=type_, message=message, link=link))
