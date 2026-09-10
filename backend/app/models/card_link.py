from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CardLink(Base):
    """A GitLab merge request linked to a card. Populated on manual link (initial
    GitLab API fetch) and kept in sync by webhook events afterward."""

    __tablename__ = "card_links"
    __table_args__ = (UniqueConstraint("card_id", "project_path", "mr_iid", name="uq_card_link_mr"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="gitlab")
    project_path: Mapped[str] = mapped_column(String(500), nullable=False)
    gitlab_project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mr_iid: Mapped[int] = mapped_column(Integer, nullable=False)
    mr_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="opened")
    source_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    author_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    card: Mapped["Card"] = relationship(back_populates="links")
    assignees: Mapped[list["MRAssignee"]] = relationship(
        back_populates="card_link",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="MRAssignee.created_at",
    )
