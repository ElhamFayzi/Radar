# Radar

A course tracker app.

- Frontend: HTML/CSS/JavaScript, rendered via Jinja templates
- Backend: Flask (Python)
- Database: SQLite, accessed via SQLAlchemy (Flask-SQLAlchemy / Flask-Migrate)

## Project structure

```
Radar/
├── app/
│   ├── __init__.py          # Application factory
│   ├── extensions.py        # Shared extension instances (db, migrate, etc.)
│   ├── models/               # SQLAlchemy models (course, task, subtask, settings)
│   ├── routes/                # Flask blueprints (main, courses, tasks, settings, export)
│   ├── templates/             # Jinja templates (single-page app shell)
│   └── static/                 # CSS, JS
├── instance/                   # Local SQLite database (gitignored)
├── migrations/                 # Flask-Migrate migration scripts
├── tests/                      # Test suite
├── scripts/                    # One-off / maintenance scripts
├── config.py                   # Flask configuration classes
├── run.py                      # Development server entry point
├── requirements.txt
└── .env.example
```

## Setup (planned)

1. Create and activate a virtual environment
2. `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and fill in values
4. Initialize the database via Flask-Migrate
5. `flask run`

## Testing

```
pip install -r requirements-dev.txt
playwright install chromium   # one-time, for the E2E tests
pytest                        # backend route tests + browser E2E tests
pytest tests --ignore=tests/e2e   # backend only, no browser needed
```

Every test runs against an isolated temp-file SQLite database created and torn
down per test (or per test session for the E2E suite) — the real
`instance/radar.db` is never touched.
