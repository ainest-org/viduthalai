"""add gitlab_connections, card_links, and webhook_events

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gitlab_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("base_url", sa.String(length=500), nullable=False),
        sa.Column("auth_type", sa.String(length=10), nullable=False, server_default="pat"),
        sa.Column("encrypted_token", sa.Text(), nullable=False),
        sa.Column("gitlab_username", sa.String(length=255), nullable=True),
        sa.Column("webhook_secret", sa.String(length=64), nullable=False),
        sa.Column(
            "connected_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("org_id", name="uq_gitlab_connection_org"),
    )

    op.create_table(
        "card_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("card_id", sa.Integer(), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="gitlab"),
        sa.Column("project_path", sa.String(length=500), nullable=False),
        sa.Column("gitlab_project_id", sa.Integer(), nullable=True),
        sa.Column("mr_iid", sa.Integer(), nullable=False),
        sa.Column("mr_url", sa.String(length=1000), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False, server_default="opened"),
        sa.Column("source_branch", sa.String(length=255), nullable=True),
        sa.Column("target_branch", sa.String(length=255), nullable=True),
        sa.Column("author_username", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("card_id", "project_path", "mr_iid", name="uq_card_link_mr"),
    )
    op.create_index("ix_card_links_card_id", "card_links", ["card_id"])
    op.create_index("ix_card_links_project_mr", "card_links", ["project_path", "mr_iid"])

    op.create_table(
        "webhook_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("processed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_webhook_events_org_id", "webhook_events", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_webhook_events_org_id", table_name="webhook_events")
    op.drop_table("webhook_events")
    op.drop_index("ix_card_links_project_mr", table_name="card_links")
    op.drop_index("ix_card_links_card_id", table_name="card_links")
    op.drop_table("card_links")
    op.drop_table("gitlab_connections")
