def test_typing_in_search_box_keeps_focus_and_registers_every_keystroke(page, base_url, course):
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Final Exam", "due_date": "2026-05-01",
    })
    page.request.post(f"{base_url}/api/tasks", data={
        "course_id": course["id"], "name": "Reading response", "due_date": "2026-05-02",
    })

    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    page.goto("/")
    page.click("[data-action='view'][data-view='table']")

    search = page.locator("#search-input")
    search.click()
    for ch in "exam":
        page.keyboard.press(ch)
        page.wait_for_timeout(150)  # let the deferred re-render settle
        assert page.evaluate("document.activeElement.id") == "search-input"

    assert search.input_value() == "exam"
    assert not errors

    rows = page.locator(".table tbody tr")
    assert rows.count() == 1
    assert "Final Exam" in rows.first.inner_text()
