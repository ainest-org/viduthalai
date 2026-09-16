"""remove kanban (boards/columns/cards/milestones/notifications) and link projects to a GitLab repo

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-16

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("mr_assignees")
    op.drop_table("notifications")
    op.drop_table("column_history")
    op.drop_table("card_links")
    op.drop_table("webhook_events")
    op.drop_table("cards")
    op.drop_table("columns")
    op.drop_table("milestones")
    op.drop_table("boards")

    # Webhook processing (RQ worker) is retired along with kanban — GitLab data is now fetched live.
    op.drop_column("gitlab_connections", "webhook_secret")

    op.add_column("projects", sa.Column("gitlab_project_id", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("gitlab_project_path", sa.String(length=500), nullable=True))
    op.add_column("projects", sa.Column("gitlab_web_url", sa.String(length=1000), nullable=True))
    op.add_column("projects", sa.Column("gitlab_default_branch", sa.String(length=255), nullable=True))
    op.create_index(
        "uq_project_gitlab_repo",
        "projects",
        ["org_id", "gitlab_project_id"],
        unique=True,
        postgresql_where=sa.text("gitlab_project_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_project_gitlab_repo", table_name="projects")
    op.drop_column("projects", "gitlab_default_branch")
    op.drop_column("projects", "gitlab_web_url")
    op.drop_column("projects", "gitlab_project_path")
    op.drop_column("projects", "gitlab_project_id")
    op.add_column(
        "gitlab_connections", sa.Column("webhook_secret", sa.String(length=64), nullable=False, server_default="")
    )

    # Kanban tables are not recreated on downgrade — this migration is a one-way removal.
