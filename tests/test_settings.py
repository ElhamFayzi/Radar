def test_get_settings_defaults(client):
    res = client.get("/api/settings")
    assert res.status_code == 200
    assert res.get_json() == {"default_reminder": "2 days before"}


def test_get_settings_is_idempotent(client):
    """Settings.get() creates a row on first access — calling it twice must not duplicate it."""
    client.get("/api/settings")
    res = client.get("/api/settings")
    assert res.get_json() == {"default_reminder": "2 days before"}


def test_update_default_reminder(client):
    res = client.patch("/api/settings", json={"default_reminder": "1 week before"})
    assert res.status_code == 200
    assert res.get_json()["default_reminder"] == "1 week before"

    assert client.get("/api/settings").get_json()["default_reminder"] == "1 week before"


def test_update_default_reminder_rejects_invalid_value(client):
    res = client.patch("/api/settings", json={"default_reminder": "whenever"})
    assert res.status_code == 400


def test_update_settings_with_no_body_is_a_noop(client):
    res = client.patch("/api/settings", json={})
    assert res.status_code == 200
    assert res.get_json()["default_reminder"] == "2 days before"
