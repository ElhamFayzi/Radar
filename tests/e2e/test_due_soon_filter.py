from datetime import date, timedelta


def test_due_soon_toggle_filters_to_today_and_tomorrow(page, base_url, course):
    today = date.today()

    def add(name, offset, status="Not Started"):
        page.request.post(f"{base_url}/api/tasks", data={
            "course_id": course["id"], "name": name,
            "due_date": (today + timedelta(days=offset)).isoformat(), "status": status,
        })

    add("Yesterday task", -1, status="In Progress")
    add("Today task", 0)
    add("Tomorrow task", 1)
    add("Next week task", 7)

    page.goto("/")
    page.click("[data-action='view'][data-view='table']")
    assert page.locator(".table tbody tr").count() == 4

    page.click("[data-action='filter-due-soon']")
    page.wait_for_timeout(200)

    rows = page.locator(".table tbody tr")
    assert rows.count() == 2
    text = rows.all_inner_texts()
    assert any("Today task" in t for t in text)
    assert any("Tomorrow task" in t for t in text)
    assert not any("Yesterday task" in t for t in text)
    assert not any("Next week task" in t for t in text)

    assert page.locator("[data-action='filter-due-soon']").get_attribute("aria-pressed") == "true"

    page.click("[data-action='reset-filters']")
    page.wait_for_timeout(200)
    assert page.locator(".table tbody tr").count() == 4
    assert page.locator("[data-action='filter-due-soon']").get_attribute("aria-pressed") == "false"
