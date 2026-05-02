async def test_assign_replaces_previous_user(client, session, seeded_berth):
    from app.models import User

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
    session.add_all([u1, u2])
    await session.commit()
