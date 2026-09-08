"""switch gitlab_connections from PAT to OAuth

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("gitlab_connections", sa.Column("client_id", sa.String(length=255), nullable=True))
    op.add_column("gitlab_connections", sa.Column("encrypted_client_secret", sa.Text(), nullable=True))
    op.add_column("gitlab_connections", sa.Column("encrypted_refresh_token", sa.Text(), nullable=True))
    op.add_column(
        "gitlab_connections", sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.alter_column("gitlab_connections", "encrypted_token", existing_type=sa.Text(), nullable=True)
    op.alter_column(
        "gitlab_connections",
        "auth_type",
        existing_type=sa.String(length=10),
        server_default="oauth",
    )
    # Any existing PAT-based row can no longer authenticate against the new flow.
    op.execute("DELETE FROM gitlab_connections WHERE auth_type = 'pat'")


def downgrade() -> None:
    op.alter_column(
        "gitlab_connections",
        "auth_type",
        existing_type=sa.String(length=10),
        server_default="pat",
    )
    op.execute("DELETE FROM gitlab_connections WHERE encrypted_token IS NULL")
    op.alter_column("gitlab_connections", "encrypted_token", existing_type=sa.Text(), nullable=False)
    op.drop_column("gitlab_connections", "token_expires_at")
    op.drop_column("gitlab_connections", "encrypted_refresh_token")
    op.drop_column("gitlab_connections", "encrypted_client_secret")
    op.drop_column("gitlab_connections", "client_id")
