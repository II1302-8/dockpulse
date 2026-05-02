import pytest
from fastapi import HTTPException

from app.dependencies import require_harbormaster
from app.models import User


def _make_user(role: str) -> User:
    return User(
        user_id="u1",
        firstname="X",
        lastname="Y",
        email="x@y.com",
        password_hash="h",
        role=role,
    )


async def testrequire_harbormaster_raises_for_boat_owner():
    user = _make_user("boat_owner")
    with pytest.raises(HTTPException) as exc:
        await require_harbormaster(user)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Harbormaster role required"


async def testrequire_harbormaster_returns_user_for_harbormaster():
    user = _make_user("harbormaster")
    result = await require_harbormaster(user)
    assert result is user
