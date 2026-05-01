import pytest


@pytest.mark.asyncio
async def test_assign_replaces_previous_user(client, session):
    from app.models import Assignment, Berth, User

    b1 = Berth(berth_id="b1", dock_id="d1", status="free")
    u1 = User(
        user_id="user_one",
        email="u1@test.com",
        password_hash="...",
        firstname="A",
        lastname="B",
    )
    u2 = User(
        user_id="user_two",
        email="u2@test.com",
        password_hash="...",
        firstname="C",
        lastname="D",
    )
    session.add_all([b1, u1, u2])
    await session.commit()

    await client.post("/api/berths/b1/assignment", json={"user_id": "user_one"})

    response = await client.post(
        "/api/berths/b1/assignment", json={"user_id": "user_two"}
    )

    assert response.status_code == 200
    data = response.json()

    assert data["assignment"]["user_id"] == "user_two"

    from sqlalchemy import func, select

    count = (
        await session.execute(select(func.count()).select_from(Assignment))
    ).scalar()
    assert count == 1  # Ensures the previous one was replaced via the PK
