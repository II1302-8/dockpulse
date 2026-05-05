from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

# enabled flag read once at construction so conftest pre-sets RATE_LIMIT_ENABLED=false
limiter = Limiter(
    key_func=get_remote_address,
    enabled=get_settings().rate_limit_enabled,
)
