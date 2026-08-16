from tests.conftest import make_task


def test_create_task_requires_course_name_due_date(client):
    res = client.post("/api/tasks", json={"name": "X"})
    assert res.status_code == 400
    assert "course_id" in res.get_json()["error"]


def test_create_task_minimal(client, course):
    res = make_task(client, course["id"])
    assert res.status_code == 201
    body = res.get_json()
    assert body["name"] == "Test task"
    assert body["due_date"] == "2026-01-15"
    assert body["due_time"] == "23:59"          # model default
    assert body["priority"] == "Medium"          # model default
    assert body["workload"] == "Moderate"        # model default
    assert body["status"] == "Not Started"       # model default
    assert body["course"]["id"] == course["id"]
    assert body["subtasks"] == []
    assert body["completed_at"] is None


def test_create_task_rejects_unknown_course(client):
    res = make_task(client, 999)
    assert res.status_code == 400
    assert "course_id" in res.get_json()["error"]


def test_create_task_rejects_blank_name(client, course):
    res = make_task(client, course["id"], name="   ")
    assert res.status_code == 400


def test_create_task_rejects_bad_due_date(client, course):
    res = make_task(client, course["id"], due_date="not-a-date")
    assert res.status_code == 400


def test_create_task_rejects_bad_due_time(client, course):
    res = make_task(client, course["id"], due_time="not-a-time")
    assert res.status_code == 400


def test_create_task_rejects_invalid_enum(client, course):
    res = make_task(client, course["id"], priority="Extreme")
    assert res.status_code == 400
    assert "priority" in res.get_json()["error"]


def test_create_task_with_full_fields(client, course):
    res = make_task(
        client, course["id"],
        type="Exam", due_time="10:30", priority="High", workload="Heavy",
        weight=25, status="In Progress", notes="bring calculator",
        reminder="1 week before",
    )
    body = res.get_json()
    assert body["type"] == "Exam"
    assert body["due_time"] == "10:30"
    assert body["priority"] == "High"
    assert body["workload"] == "Heavy"
    assert body["weight"] == 25
    assert body["status"] == "In Progress"
    assert body["notes"] == "bring calculator"
    assert body["reminder"] == "1 week before"


def test_create_task_weight_blank_becomes_null(client, course):
    res = make_task(client, course["id"], weight="")
    assert res.get_json()["weight"] is None


def test_create_task_with_subtasks_string_and_dict_forms(client, course):
    res = make_task(client, course["id"], subtasks=[
        "Part A",
        {"text": "Part B", "done": True},
        {"text": "  "},  # blank text should be dropped
    ])
    subtasks = res.get_json()["subtasks"]
    assert len(subtasks) == 2
    assert subtasks[0] == {"id": subtasks[0]["id"], "text": "Part A", "done": False}
    assert subtasks[1] == {"id": subtasks[1]["id"], "text": "Part B", "done": True}


def test_get_task(client, course):
    created = make_task(client, course["id"]).get_json()
    res = client.get(f"/api/tasks/{created['id']}")
    assert res.status_code == 200
    assert res.get_json()["id"] == created["id"]


def test_get_missing_task_404(client):
    assert client.get("/api/tasks/999").status_code == 404


def test_list_tasks_sorted_by_due_date(client, course):
    make_task(client, course["id"], name="Later", due_date="2026-02-01")
    make_task(client, course["id"], name="Sooner", due_date="2026-01-01")
    names = [t["name"] for t in client.get("/api/tasks").get_json()]
    assert names == ["Sooner", "Later"]


def test_list_tasks_filter_by_course_id(client, course):
    other = client.post("/api/courses", json={"name": "Other"}).get_json()
    make_task(client, course["id"], name="A")
    make_task(client, other["id"], name="B")
    res = client.get(f"/api/tasks?course_id={course['id']}")
    names = [t["name"] for t in res.get_json()]
    assert names == ["A"]


def test_list_tasks_filter_by_status(client, course):
    make_task(client, course["id"], name="Done one", status="Done")
    make_task(client, course["id"], name="Todo one", status="Not Started")
    res = client.get("/api/tasks?status=Done")
    names = [t["name"] for t in res.get_json()]
    assert names == ["Done one"]


def test_list_tasks_invalid_status_filter(client):
    res = client.get("/api/tasks?status=Whenever")
    assert res.status_code == 400


def test_update_task_fields(client, course):
    task = make_task(client, course["id"]).get_json()
    res = client.patch(f"/api/tasks/{task['id']}", json={
        "name": "Renamed", "priority": "High", "notes": "updated",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "Renamed"
    assert body["priority"] == "High"
    assert body["notes"] == "updated"


def test_update_task_change_course(client, course):
    other = client.post("/api/courses", json={"name": "Other"}).get_json()
    task = make_task(client, course["id"]).get_json()
    res = client.patch(f"/api/tasks/{task['id']}", json={"course_id": other["id"]})
    assert res.get_json()["course"]["id"] == other["id"]


def test_update_task_rejects_unknown_course(client, course):
    task = make_task(client, course["id"]).get_json()
    res = client.patch(f"/api/tasks/{task['id']}", json={"course_id": 999})
    assert res.status_code == 400


def test_update_missing_task_404(client):
    assert client.patch("/api/tasks/999", json={"name": "x"}).status_code == 404


def test_delete_task(client, course):
    task = make_task(client, course["id"]).get_json()
    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_delete_missing_task_404(client):
    assert client.delete("/api/tasks/999").status_code == 404


def test_add_subtask(client, course):
    task = make_task(client, course["id"]).get_json()
    res = client.post(f"/api/tasks/{task['id']}/subtasks", json={"text": "Step 1"})
    assert res.status_code == 201
    body = res.get_json()
    assert body["text"] == "Step 1"
    assert body["done"] is False


def test_add_subtask_requires_text(client, course):
    task = make_task(client, course["id"]).get_json()
    res = client.post(f"/api/tasks/{task['id']}/subtasks", json={"text": "  "})
    assert res.status_code == 400


def test_update_subtask(client, course):
    task = make_task(client, course["id"]).get_json()
    sub = client.post(f"/api/tasks/{task['id']}/subtasks", json={"text": "Step 1"}).get_json()
    res = client.patch(f"/api/tasks/{task['id']}/subtasks/{sub['id']}", json={"done": True, "text": "Step 1 edited"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["done"] is True
    assert body["text"] == "Step 1 edited"


def test_delete_subtask(client, course):
    task = make_task(client, course["id"]).get_json()
    sub = client.post(f"/api/tasks/{task['id']}/subtasks", json={"text": "Step 1"}).get_json()
    assert client.delete(f"/api/tasks/{task['id']}/subtasks/{sub['id']}").status_code == 204

    refreshed = client.get(f"/api/tasks/{task['id']}").get_json()
    assert refreshed["subtasks"] == []


def test_subtask_endpoints_require_matching_task_id(client, course):
    task_a = make_task(client, course["id"]).get_json()
    task_b = make_task(client, course["id"]).get_json()
    sub = client.post(f"/api/tasks/{task_a['id']}/subtasks", json={"text": "Step 1"}).get_json()

    # Subtask belongs to task_a, not task_b — must 404 under the wrong parent.
    res = client.patch(f"/api/tasks/{task_b['id']}/subtasks/{sub['id']}", json={"done": True})
    assert res.status_code == 404
