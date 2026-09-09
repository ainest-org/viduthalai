"""add personal GitLab identity to users, for sign-in-with-GitLab

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "gitlab_connection_id",
            sa.Integer(),
            sa.ForeignKey("gitlab_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("users", sa.Column("gitlab_user_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("gitlab_username", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("encrypted_gitlab_token", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("encrypted_gitlab_refresh_token", sa.Text(), nullable=True))
    op.add_column(
        "users", sa.Column("gitlab_token_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_user_gitlab_identity ON users (gitlab_connection_id, gitlab_user_id) "
        "WHERE gitlab_user_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX uq_user_gitlab_identity")
    op.drop_column("users", "gitlab_token_expires_at")
    op.drop_column("users", "encrypted_gitlab_refresh_token")
    op.drop_column("users", "encrypted_gitlab_token")
    op.drop_column("users", "gitlab_username")
    op.drop_column("users", "gitlab_user_id")
    op.drop_column("users", "gitlab_connection_id")
