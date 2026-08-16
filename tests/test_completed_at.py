from tests.conftest import make_task


def test_completed_at_set_on_transition_to_done(client, course):
    task = make_task(client, course["id"]).get_json()
    assert task["completed_at"] is None

    res = client.patch(f"/api/tasks/{task['id']}", json={"status": "Done"})
    assert res.get_json()["completed_at"] is not None


def test_completed_at_set_when_created_done(client, course):
    res = make_task(client, course["id"], status="Done")
    assert res.get_json()["completed_at"] is not None


def test_completed_at_cleared_when_undone(client, course):
    task = make_task(client, course["id"], status="Done").get_json()
    assert task["completed_at"] is not None

    res = client.patch(f"/api/tasks/{task['id']}", json={"status": "In Progress"})
    assert res.get_json()["completed_at"] is None


def test_completed_at_untouched_by_unrelated_edit(client, course):
    """Regression test: editing a Done task's notes must not re-stamp completed_at."""
    task = make_task(client, course["id"], status="Done").get_json()
    first_stamp = task["completed_at"]

    res = client.patch(f"/api/tasks/{task['id']}", json={"notes": "just a note"})
    assert res.get_json()["completed_at"] == first_stamp


def test_completed_at_untouched_by_resaving_same_status(client, course):
    task = make_task(client, course["id"], status="Done").get_json()
    first_stamp = task["completed_at"]

    res = client.patch(f"/api/tasks/{task['id']}", json={"status": "Done"})
    assert res.get_json()["completed_at"] == first_stamp
