"""add_performance_indexes

Revision ID: bfc7e0d92ee6
Revises: e3b6a1d9f2c7
Create Date: 2026-06-04 11:40:19.519952

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bfc7e0d92ee6"
down_revision: Union[str, None] = "e3b6a1d9f2c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Manual clean upgrades to create missing performance indexes
    op.create_index(
        op.f("ix_transmitters_norad_cat_id"), "transmitters", ["norad_cat_id"], unique=False
    )
    op.create_index(
        op.f("ix_transmitters_norad_follow_id"), "transmitters", ["norad_follow_id"], unique=False
    )
    op.create_index(op.f("ix_preferences_name"), "preferences", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_preferences_name"), table_name="preferences")
    op.drop_index(op.f("ix_transmitters_norad_follow_id"), table_name="transmitters")
    op.drop_index(op.f("ix_transmitters_norad_cat_id"), table_name="transmitters")
