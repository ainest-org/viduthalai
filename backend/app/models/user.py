from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Personal GitLab identity, set when the user signs in with GitLab. Separate from
    # gitlab_connections, which holds the org-wide service credential used for MR linking.
    gitlab_connection_id: Mapped[int | None] = mapped_column(
        ForeignKey("gitlab_connections.id", ondelete="SET NULL"), nullable=True
    )
    gitlab_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gitlab_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    encrypted_gitlab_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_gitlab_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    gitlab_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    boards: Mapped[list["Board"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    gitlab_connection: Mapped["GitLabConnection | None"] = relationship(
        lazy="selectin", foreign_keys=[gitlab_connection_id]
    )
