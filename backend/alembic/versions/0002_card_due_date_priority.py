"""add due_date and priority to cards

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cards", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column("cards", sa.Column("priority", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("cards", "priority")
    op.drop_column("cards", "due_date")
