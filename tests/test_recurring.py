from datetime import date, timedelta

from app.extensions import db
from app.models import Task
from tests.conftest import make_task

OCCURRENCE_LOOKAHEAD_WEEKS = 8


def test_create_recurring_task_does_not_500(client, course):
    """Regression: reading template.course_id before the row was flushed crashed this."""
    res = make_task(client, course["id"], recurring=True)
    assert res.status_code == 201
    assert res.get_json()["recurring"] is True


def test_create_recurring_task_materializes_weekly_series(client, course):
    today = date.today()
    make_task(client, course["id"], name="Weekly reading", due_date=today.isoformat(), recurring=True)

    tasks = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Weekly reading"]
    due_dates = sorted(t["due_date"] for t in tasks)

    assert len(tasks) > 1
    for i in range(1, len(due_dates)):
        prev = date.fromisoformat(due_dates[i - 1])
        cur = date.fromisoformat(due_dates[i])
        assert (cur - prev).days == 7, "occurrences must be exactly one week apart"

    horizon = today + timedelta(weeks=OCCURRENCE_LOOKAHEAD_WEEKS)
    last = date.fromisoformat(due_dates[-1])
    assert today < last <= horizon, "must reach the lookahead horizon without overshooting it"


def test_non_recurring_task_creates_no_series(client, course):
    make_task(client, course["id"], name="One off", recurring=False)
    tasks = [t for t in client.get("/api/tasks").get_json() if t["name"] == "One off"]
    assert len(tasks) == 1


def test_recurring_occurrences_are_independent_on_delete(client, course):
    today = date.today()
    make_task(client, course["id"], name="Series", due_date=today.isoformat(), recurring=True)
    tasks = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Series"]
    assert len(tasks) > 2

    victim = sorted(tasks, key=lambda t: t["due_date"])[2]
    client.delete(f"/api/tasks/{victim['id']}")

    remaining = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Series"]
    assert len(remaining) == len(tasks) - 1
    assert victim["id"] not in {t["id"] for t in remaining}


def test_recurring_occurrences_are_independent_on_complete(client, course):
    today = date.today()
    make_task(client, course["id"], name="Series", due_date=today.isoformat(), recurring=True)
    tasks = sorted(
        [t for t in client.get("/api/tasks").get_json() if t["name"] == "Series"],
        key=lambda t: t["due_date"],
    )

    client.patch(f"/api/tasks/{tasks[0]['id']}", json={"status": "Done"})

    after = {t["id"]: t["status"] for t in client.get("/api/tasks").get_json() if t["name"] == "Series"}
    assert after[tasks[0]["id"]] == "Done"
    for t in tasks[1:]:
        assert after[t["id"]] == "Not Started"


def test_turning_recurring_on_via_patch_starts_a_series(client, course):
    task = make_task(client, course["id"], name="Newly recurring", recurring=False).get_json()
    client.patch(f"/api/tasks/{task['id']}", json={"recurring": True})

    tasks = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Newly recurring"]
    assert len(tasks) > 1


def test_unrelated_edit_does_not_start_a_series_for_legacy_recurring_task(app, client, course):
    """Regression: a task that already has recurring=True but predates the series
    feature (series_id=None, e.g. old seed data) must NOT spawn a series just
    because an unrelated field was edited."""
    with app.app_context():
        task = Task(course_id=course["id"], name="Legacy recurring", due_date=date.today(), recurring=True)
        db.session.add(task)
        db.session.commit()
        task_id = task.id

    client.patch(f"/api/tasks/{task_id}", json={"notes": "just editing notes"})

    tasks = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Legacy recurring"]
    assert len(tasks) == 1, "an unrelated edit must not retroactively generate a series"


def test_get_tasks_tops_up_a_short_series(app, client, course):
    """The horizon self-heals: a series whose latest occurrence has fallen short
    of the lookahead window gets extended on the next fetch."""
    today = date.today()
    with app.app_context():
        template = Task(
            course_id=course["id"], name="Short series", due_date=today,
            recurring=True, series_id="fixed-series-id",
        )
        db.session.add(template)
        db.session.add(Task(
            course_id=course["id"], name="Short series", due_date=today + timedelta(weeks=1),
            recurring=True, series_id="fixed-series-id",
        ))
        db.session.commit()

    before = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Short series"]
    # First GET already ran maintenance; call again to confirm stability (no runaway growth).
    after = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Short series"]

    assert len(before) > 2, "the short series should have been topped up toward the horizon"
    assert len(before) == len(after), "an already-satisfied horizon must not keep growing"


def test_top_up_does_not_backfill_past_weeks(app, client, course):
    """If a series' only surviving occurrence is stale (its future ones were deleted),
    topping it up must not flood in already-overdue placeholder tasks."""
    stale_date = date.today() - timedelta(weeks=20)
    with app.app_context():
        template = Task(
            course_id=course["id"], name="Stale series", due_date=stale_date,
            recurring=True, series_id="stale-series-id",
        )
        db.session.add(template)
        db.session.commit()

    tasks = [t for t in client.get("/api/tasks").get_json() if t["name"] == "Stale series"]
    due_dates = [date.fromisoformat(t["due_date"]) for t in tasks]

    assert all(d >= date.today() - timedelta(weeks=20) for d in due_dates)
    # None of the newly-generated occurrences should be in the past.
    generated = [d for d in due_dates if d != stale_date]
    assert all(d >= date.today() for d in generated), "must not backfill overdue weeks"


def test_deleting_course_removes_recurring_series(client, course):
    today = date.today()
    make_task(client, course["id"], name="Series", due_date=today.isoformat(), recurring=True)
    assert len([t for t in client.get("/api/tasks").get_json() if t["name"] == "Series"]) > 1

    client.delete(f"/api/courses/{course['id']}")

    assert client.get("/api/tasks").get_json() == []
