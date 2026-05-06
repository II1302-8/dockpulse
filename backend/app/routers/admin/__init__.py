"""endpoints for admin.<env>.dockpulse.xyz, auth via Cf-Access-Jwt-Assertion

cf access gates the host at the edge, backend validates jwt per request so
admins are decoupled from the user/role table. sub-routers per resource
aggregated under one /api/admin prefix
"""

from fastapi import APIRouter, Depends

from app.routers.admin._deps import require_cf_access
from app.routers.admin.adoptions import router as adoptions_router
from app.routers.admin.berths import router as berths_router
from app.routers.admin.docks import router as docks_router
from app.routers.admin.gateways import router as gateways_router
from app.routers.admin.harbors import router as harbors_router
from app.routers.admin.nodes import router as nodes_router
from app.routers.admin.snapshot import router as snapshot_router
from app.routers.admin.users import router as users_router

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_cf_access)],
)

for _sub in (
    snapshot_router,
    harbors_router,
    docks_router,
    berths_router,
    gateways_router,
    nodes_router,
    adoptions_router,
    users_router,
):
    router.include_router(_sub)

__all__ = ["router"]
