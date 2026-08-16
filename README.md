# Radar

A single-user, locally-run coursework deadline tracker that replaces the syllabus-and-sticky-notes approach with one dashboard for every assignment, exam, and reading across all your classes. It's a personal project, built collaboratively with Claude Code, designed and built end-to-end with a relational schema, a REST API, and a hand-rolled frontend.

**Stack:** Flask + SQLAlchemy + SQLite on the backend; a single-page vanilla HTML/CSS/JS frontend with no framework and no build step.

## Features

- Track courses (name + color) and, per course, tasks: assignment type (Homework,
  Exam, Project, Reading, Paper, Other), due date and time, priority, workload,
  grade weight, status, notes, and checkable subtasks
- Recurring weekly tasks: occurrences are pre-materialized 8 weeks ahead (not
  computed on the fly), so each week's copy can be completed, edited, or
  deleted independently without touching its siblings; the horizon
  self-maintains on every load
- Natural-language quick-add bar: type something like `CS 251 Final Exam due
  Aug 20 11:59pm heavy workload low priority` and it parses out the course,
  title, due date/time, workload, and priority automatically
- Four views: Dashboard (stat cards + "On the radar" upcoming list), Table,
  Kanban (drag a card between columns to change its status), and Timeline
- Filtering and free-text search, by course, type, priority, status, and a
  "due by end of tomorrow" toggle, applied consistently across Table and
  Kanban (including the Kanban Done column)
- Inline status editing: a clickable status dropdown in Table view, drag-and-drop
  in Kanban
- Per-task reminder lead time, with a configurable app-wide default in Settings
- Calendar export (`.ics`, excludes completed tasks, for subscribing in a
  calendar app) and full CSV export (includes everything, for backup/archival)
- Dark "Nocturne" theme throughout

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Running the app

```bash
source .venv/bin/activate
export FLASK_APP=run.py
flask db upgrade    # creates instance/radar.db and applies migrations
flask run --port 5055
```

Then open **http://127.0.0.1:5055/**.

Port 5055 is used rather than Flask's default 5000. On macOS, port 5000 is
often held by the AirPlay Receiver service (Control Center), which will
silently swallow requests instead of reaching Flask.

On first run, `instance/radar.db` is created automatically by the migration
step above (gitignored). To load realistic demo data (6 courses, 20 tasks)
instead of starting from an empty database, run:

```bash
python scripts/seed_db.py
```

## Launching without Terminal (macOS)

Double-click **`Radar.command`** at the repo root. It opens a Terminal window, and:

- if the server is already running, it just opens your browser to it and exits
- otherwise it checks the venv/dependencies exist (printing setup instructions
  and waiting for Enter if not), applies any pending migrations, starts the
  server, and opens your browser automatically once it responds

Closing that Terminal window stops the server (it's the actual server
process, not a wrapper around it, so no orphaned background process left behind).

It has a custom icon and its `.command` extension is hidden, so it looks like
a real app rather than a script. That comes from macOS Finder metadata
(`fileicon` + `SetFile -a E`) living in extended attributes, **git does not
track extended attributes at all**, so any `git checkout`/`clone`/`pull`/`merge`
that touches this file resets it to a generic icon with the extension visible
again (the script itself still works immediately either way). Re-apply it with:

```bash
./scripts/set_icon.sh
```

The icon source (`app/static/icon/icon-source.html`) and packaged
`app/static/icon/Radar.icns` are committed as normal repo assets, so
`set_icon.sh` never needs to regenerate anything, it just re-applies what's
already there.

### Shortcuts elsewhere (Desktop, Dock, etc.)

A Finder alias to `Radar.command` works from anywhere — aliases resolve back
to the real file when opened, so the script still finds the project and runs
correctly. But Finder doesn't copy the custom-icon flag onto a new alias, so
a plain alias shows a generic icon even though the original has the Radar
one. Create the shortcut with the icon already applied instead of doing it
by hand:

```bash
./scripts/make_shortcut.sh          # creates it on the Desktop
./scripts/make_shortcut.sh ~/some/other/folder
```

## Configuration

All optional, read from environment variables:

| Variable       | Default                              | Purpose                             |
|----------------|---------------------------------------|--------------------------------------|
| `SECRET_KEY`   | `dev`                                 | Flask session/cookie signing key     |
| `DATABASE_URL` | `sqlite:///instance/radar.db`         | SQLAlchemy database URI              |

## API overview

All resource routes return/accept JSON and live under `/api`; `/export.ics`
and `/export.csv` are top-level.

| Route                                            | Purpose                                    |
|---------------------------------------------------|---------------------------------------------|
| `GET/POST /api/courses`                            | List / create courses                       |
| `PATCH/DELETE /api/courses/<id>`                    | Rename/recolor / delete a course            |
| `GET/POST /api/tasks`                               | List (also tops up recurring series) / create tasks |
| `GET/PATCH/DELETE /api/tasks/<id>`                  | Read / update / delete a task               |
| `POST /api/tasks/<id>/subtasks`                     | Add a subtask                               |
| `PATCH/DELETE /api/tasks/<id>/subtasks/<subtask_id>`| Toggle / delete a subtask                   |
| `GET/PATCH /api/settings`                           | Read / update app-wide settings             |
| `GET /export.ics`                                   | Calendar feed of non-Done tasks             |
| `GET /export.csv`                                   | Full CSV backup of all tasks                |

## Running tests

```bash
source .venv/bin/activate
pip install -r requirements-dev.txt
playwright install chromium   # one-time, for the E2E tests
pytest                        # backend route tests + browser E2E tests
pytest tests --ignore=tests/e2e   # backend only, no browser needed
```

Every test runs against an isolated temp-file SQLite database created and
torn down per test (or per test session for the E2E suite). The real
`instance/radar.db` is never touched.

## Project structure

```
app/
  models/       one file per table (Course, Task, Subtask, Settings)
  routes/       one blueprint per resource (main, courses, tasks, settings, export)
  static/       css/js for the frontend SPA, plus the app icon source/.icns
  templates/    the single index.html shell
migrations/     Flask-Migrate/Alembic migration scripts
scripts/        seed_db.py (demo data) and set_icon.sh (macOS launcher icon)
tests/          pytest suite (backend routes) + tests/e2e (Playwright)
```
