from datetime import date


def test_changing_status_select_updates_task(page, base_url, course):
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Homework 1",
        "due_date": date.today().isoformat(), "status": "Not Started",
    })

    page.goto("/")
    page.click("[data-action='view'][data-view='table']")

    select = page.locator(".status-select")
    assert select.input_value() == "Not Started"

    select.select_option("In Progress")
    page.wait_for_timeout(300)

    assert page.locator(".status-select").input_value() == "In Progress"
    tasks = page.request.get(f"{base_url}/api/tasks").json()
    assert tasks[0]["status"] == "In Progress"
