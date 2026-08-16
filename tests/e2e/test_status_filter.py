def test_status_done_filter_shows_done_tasks(page, base_url, course):
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Finished work", "due_date": "2026-01-01", "status": "Done",
    })
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Pending work", "due_date": "2026-01-02", "status": "Not Started",
    })

    page.goto("/")
    page.click("[data-action='view'][data-view='table']")

    # Table view hides Done tasks by default (stays uncluttered) — only the
    # Not Started one shows until Done is explicitly requested.
    assert page.locator(".table tbody tr").count() == 1

    page.select_option("select[data-filter='Status']", "Done")
    page.wait_for_timeout(200)

    rows = page.locator(".table tbody tr")
    assert rows.count() == 1
    assert "Finished work" in rows.first.inner_text()
    assert "done" in page.locator(".filters .muted-sm").inner_text().lower()


def test_status_not_started_filter_still_works(page, base_url, course):
    """Regression coverage: fixing Status=Done must not break the other statuses."""
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Finished work", "due_date": "2026-01-01", "status": "Done",
    })
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Pending work", "due_date": "2026-01-02", "status": "Not Started",
    })

    page.goto("/")
    page.click("[data-action='view'][data-view='table']")
    page.select_option("select[data-filter='Status']", "Not Started")
    page.wait_for_timeout(200)

    rows = page.locator(".table tbody tr")
    assert rows.count() == 1
    assert "Pending work" in rows.first.inner_text()
