"""move is_reserved from assignments to berths

Revision ID: 7463e76ab754
Revises: 24fe6fddcaca
Create Date: 2026-05-02 19:23:54.548182

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7463e76ab754'
down_revision: Union[str, Sequence[str], None] = '24fe6fddcaca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('assignments', 'is_reserved')
    op.add_column('berths', sa.Column('is_reserved', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('berths', 'is_reserved')
    op.add_column('assignments', sa.Column('is_reserved', sa.Boolean(), nullable=False, server_default='false'))
