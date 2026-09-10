from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MRAssignee(Base):
    """A Viduthalai user assigned to work on a linked merge request. Distinct from
    GitLab's own MR assignees — this is Viduthalai's internal tracking, the basis
    for time-tracking against a person+MR pair later."""

    __tablename__ = "mr_assignees"
    __table_args__ = (UniqueConstraint("card_link_id", "user_id", name="uq_mr_assignee"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    card_link_id: Mapped[int] = mapped_column(ForeignKey("card_links.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    card_link: Mapped["CardLink"] = relationship(back_populates="assignees")
    user: Mapped["User"] = relationship(foreign_keys=[user_id], lazy="selectin")

    @property
    def name(self) -> str:
        return self.user.name

    @property
    def email(self) -> str:
        return self.user.email
