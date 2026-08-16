def test_list_courses_empty(client):
    res = client.get("/api/courses")
    assert res.status_code == 200
    assert res.get_json() == []


def test_create_course(client):
    res = client.post("/api/courses", json={"name": "CS 251", "color": "#7aa2f7"})
    assert res.status_code == 201
    body = res.get_json()
    assert body["name"] == "CS 251"
    assert body["color"] == "#7aa2f7"
    assert "id" in body


def test_create_course_defaults_color(client):
    res = client.post("/api/courses", json={"name": "Personal"})
    assert res.status_code == 201
    assert res.get_json()["color"] == "#9b9fb5"


def test_create_course_requires_name(client):
    res = client.post("/api/courses", json={"color": "#000000"})
    assert res.status_code == 400


def test_create_course_rejects_blank_name(client):
    res = client.post("/api/courses", json={"name": "   "})
    assert res.status_code == 400


def test_create_course_rejects_duplicate_name(client, course):
    res = client.post("/api/courses", json={"name": course["name"]})
    assert res.status_code == 409


def test_list_courses_sorted_by_name(client):
    client.post("/api/courses", json={"name": "Zoology"})
    client.post("/api/courses", json={"name": "Anatomy"})
    names = [c["name"] for c in client.get("/api/courses").get_json()]
    assert names == ["Anatomy", "Zoology"]


def test_update_course_name_and_color(client, course):
    res = client.patch(f"/api/courses/{course['id']}", json={"name": "CS 999", "color": "#ffffff"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "CS 999"
    assert body["color"] == "#ffffff"


def test_update_course_rejects_blank_name(client, course):
    res = client.patch(f"/api/courses/{course['id']}", json={"name": "  "})
    assert res.status_code == 400


def test_update_course_rejects_rename_to_existing_name(client, course):
    other = client.post("/api/courses", json={"name": "Other Course"}).get_json()
    res = client.patch(f"/api/courses/{other['id']}", json={"name": course["name"]})
    assert res.status_code == 409


def test_update_course_can_keep_own_name(client, course):
    """Renaming a course to the name it already has must not collide with itself."""
    res = client.patch(f"/api/courses/{course['id']}", json={"name": course["name"]})
    assert res.status_code == 200


def test_update_missing_course_404(client):
    res = client.patch("/api/courses/999", json={"name": "X"})
    assert res.status_code == 404


def test_delete_course(client, course):
    res = client.delete(f"/api/courses/{course['id']}")
    assert res.status_code == 204
    assert client.get("/api/courses").get_json() == []


def test_delete_course_cascades_to_tasks(client, course):
    task = client.post("/api/tasks", json={
        "course_id": course["id"], "name": "Reading", "due_date": "2026-01-10",
    }).get_json()

    client.delete(f"/api/courses/{course['id']}")

    assert client.get(f"/api/tasks/{task['id']}").status_code == 404
