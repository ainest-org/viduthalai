from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GitLabConnection(Base):
    """One GitLab instance connection per organization. auth_type is 'pat' today;
    kept as a column so a future OAuth flow can populate the same row/table."""

    __tablename__ = "gitlab_connections"
    __table_args__ = (UniqueConstraint("org_id", name="uq_gitlab_connection_org"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(10), nullable=False, default="pat")
    encrypted_token: Mapped[str] = mapped_column(Text, nullable=False)
    gitlab_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    webhook_secret: Mapped[str] = mapped_column(String(64), nullable=False)
    connected_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped["Organization"] = relationship()
