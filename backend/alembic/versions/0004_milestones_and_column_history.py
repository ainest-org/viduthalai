"""add milestones, card milestone_id, and column_history

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column(
        "cards",
        sa.Column(
            "milestone_id",
            sa.Integer(),
            sa.ForeignKey("milestones.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    op.create_table(
        "column_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("card_id", sa.Integer(), sa.ForeignKey("cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "from_column_id",
            sa.Integer(),
            sa.ForeignKey("columns.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "to_column_id", sa.Integer(), sa.ForeignKey("columns.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_column_history_card_id", "column_history", ["card_id"])


def downgrade() -> None:
    op.drop_index("ix_column_history_card_id", table_name="column_history")
    op.drop_table("column_history")
    op.drop_column("cards", "milestone_id")
    op.drop_table("milestones")
