"""Shared admin-router primitives: CF Access dep + argon2 hasher singleton."""

import logging
from typing import Annotated

from argon2 import PasswordHasher
from fastapi import Depends, Header, HTTPException

from app.cf_access import HEADER, AccessAuthError, AccessIdentity, verify_assertion

logger = logging.getLogger(__name__)

_ph = PasswordHasher()


def password_hasher() -> PasswordHasher:
    return _ph


async def require_cf_access(
    cf_jwt: Annotated[str | None, Header(alias=HEADER)] = None,
) -> AccessIdentity:
    if cf_jwt is None:
        raise HTTPException(
            status_code=401,
            detail=(
                f"Missing {HEADER} header (request must come through Cloudflare Access)"
            ),
        )
    try:
        identity = verify_assertion(cf_jwt)
    except AccessAuthError as err:
        raise HTTPException(status_code=401, detail=str(err)) from err
    logger.info("admin request from %s", identity.email)
    return identity


CfAccessDep = Annotated[AccessIdentity, Depends(require_cf_access)]
