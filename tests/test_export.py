import csv
import io

from tests.conftest import make_task


def test_ics_export_headers(client):
    res = client.get("/export.ics")
    assert res.status_code == 200
    assert res.mimetype == "text/calendar"
    assert "coursework.ics" in res.headers["Content-Disposition"]


def test_ics_export_wraps_events_correctly(client, course):
    make_task(client, course["id"], name="Final Exam", due_date="2026-05-01", due_time="09:00")
    body = client.get("/export.ics").get_data(as_text=True)

    assert body.startswith("BEGIN:VCALENDAR\r\n")
    assert body.rstrip("\r\n").endswith("END:VCALENDAR")
    assert "BEGIN:VEVENT" in body
    assert "DTSTART:20260501T090000" in body
    assert f"SUMMARY:[{course['name']}] Final Exam" in body


def test_ics_export_excludes_done_tasks(client, course):
    make_task(client, course["id"], name="Finished", status="Done")
    make_task(client, course["id"], name="Pending", status="Not Started")

    body = client.get("/export.ics").get_data(as_text=True)
    assert "Finished" not in body
    assert "Pending" in body


def test_ics_export_escapes_special_characters(client, course):
    make_task(client, course["id"], name="Read ch. 1, 2; and 3\nreview")
    body = client.get("/export.ics").get_data(as_text=True)
    assert "1\\, 2\\; and 3\\nreview" in body


def test_ics_export_includes_weight_and_notes_in_description(client, course):
    make_task(client, course["id"], name="Essay", weight=15.5, notes="cite three sources")
    body = client.get("/export.ics").get_data(as_text=True)
    assert "cite three sources" in body
    assert "Worth 15.5% of grade" in body


def test_csv_export_headers(client):
    res = client.get("/export.csv")
    assert res.status_code == 200
    assert res.mimetype == "text/csv"
    assert "coursework.csv" in res.headers["Content-Disposition"]


def test_csv_export_never_includes_spent_hours(client):
    body = client.get("/export.csv").get_data(as_text=True)
    assert "Spent Hours" not in body
    assert "spent_hours" not in body


def test_csv_export_includes_done_tasks_unlike_ics(client, course):
    """CSV export is a full backup — unlike the calendar feed, it must include completed work."""
    make_task(client, course["id"], name="Finished", status="Done")
    body = client.get("/export.csv").get_data(as_text=True)
    assert "Finished" in body


def test_csv_export_row_content_and_subtask_formatting(client, course):
    make_task(
        client, course["id"], name="Project", type="Project", due_date="2026-03-01",
        due_time="17:00", priority="High", workload="Heavy", weight=20, status="In Progress",
        recurring=True, subtasks=[{"text": "Design", "done": True}, {"text": "Build", "done": False}],
    )
    body = client.get("/export.csv").get_data(as_text=True)
    rows = list(csv.DictReader(io.StringIO(body)))
    # recurring=True materializes further weekly occurrences too; pin down the original.
    row = next(r for r in rows if r["Assignment"] == "Project" and r["Due Date"] == "2026-03-01")

    assert row["Course"] == course["name"]
    assert row["Type"] == "Project"
    assert row["Due Date"] == "2026-03-01"
    assert row["Due Time"] == "17:00"
    assert row["Priority"] == "High"
    assert row["Workload"] == "Heavy"
    assert row["Weight (%)"] == "20.0"
    assert row["Status"] == "In Progress"
    assert row["Recurring"] == "Yes"
    assert row["Subtasks"] == "[x] Design; [ ] Build"


def test_csv_export_blank_weight_is_empty_string(client, course):
    make_task(client, course["id"], name="No weight task")
    body = client.get("/export.csv").get_data(as_text=True)
    rows = list(csv.DictReader(io.StringIO(body)))
    row = next(r for r in rows if r["Assignment"] == "No weight task")
    assert row["Weight (%)"] == ""
