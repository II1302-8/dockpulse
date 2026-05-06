"""node decommission"""

from httpx import AsyncClient


async def test_decommission_unknown_node_returns_404(
    client: AsyncClient, auth_headers, harbor_world
):
    r = await client.post(
        "/api/admin/nodes/no-such-node/decommission", headers=auth_headers
    )
    assert r.status_code == 404
