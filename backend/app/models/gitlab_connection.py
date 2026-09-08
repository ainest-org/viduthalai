from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GitLabConnection(Base):
    """One GitLab OAuth connection per organization, against a self-hosted instance.
    client_id/encrypted_client_secret come from an OAuth application the org admin
    registers on that GitLab instance; encrypted_token/encrypted_refresh_token are
    populated once the admin completes the authorize redirect."""

    __tablename__ = "gitlab_connections"
    __table_args__ = (UniqueConstraint("org_id", name="uq_gitlab_connection_org"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(10), nullable=False, default="oauth")

    client_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    encrypted_client_secret: Mapped[str | None] = mapped_column(Text, nullable=True)

    encrypted_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    gitlab_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    webhook_secret: Mapped[str] = mapped_column(String(64), nullable=False)
    connected_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped["Organization"] = relationship()
