def test_done_column_respects_search_filter(page, base_url, course):
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Chapter 1 reading",
        "due_date": "2026-01-01", "status": "Done",
    })
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Unrelated essay",
        "due_date": "2026-01-02", "status": "Done",
    })

    page.goto("/")
    page.click("[data-action='view'][data-view='kanban']")

    done_col = page.locator("[data-drop='Done']")
    assert done_col.locator(".kcard").count() == 2

    page.fill("#search-input", "Chapter")
    page.wait_for_timeout(300)

    assert done_col.locator(".kcard").count() == 1
    assert "Chapter 1 reading" in done_col.inner_text()
    assert "Unrelated essay" not in done_col.inner_text()


def test_done_column_respects_course_filter(page, base_url, course):
    other = page.request.post(f"{base_url}/api/courses", data={"name": "Other Course"}).json()
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "In this course", "due_date": "2026-01-01", "status": "Done",
    })
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": other["id"], "name": "In other course", "due_date": "2026-01-02", "status": "Done",
    })

    page.goto("/")
    page.click("[data-action='view'][data-view='kanban']")
    page.select_option("select[data-filter='Course']", course["name"])
    page.wait_for_timeout(200)

    done_col = page.locator("[data-drop='Done']")
    assert done_col.locator(".kcard").count() == 1
    assert "In this course" in done_col.inner_text()
