"""merge assignment and fk-indexes heads

Revision ID: 24fe6fddcaca
Revises: 9ff8773b91b4, e9b06da1b491
Create Date: 2026-05-02 19:08:14.490301

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '24fe6fddcaca'
down_revision: Union[str, Sequence[str], None] = ('9ff8773b91b4', 'e9b06da1b491')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
