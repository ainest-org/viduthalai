"""add mr_assignees and notifications

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mr_assignees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "card_link_id", sa.Integer(), sa.ForeignKey("card_links.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "assigned_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("card_link_id", "user_id", name="uq_mr_assignee"),
    )
    op.create_index("ix_mr_assignees_card_link_id", "mr_assignees", ["card_link_id"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("link", sa.String(length=500), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_user_id_read", "notifications", ["user_id", "read"])


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id_read", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("ix_mr_assignees_card_link_id", table_name="mr_assignees")
    op.drop_table("mr_assignees")
