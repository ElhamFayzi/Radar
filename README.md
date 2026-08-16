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
│   ├── models/               # SQLAlchemy models (user, course, enrollment)
│   ├── routes/                # Flask blueprints (main, auth, courses)
│   ├── templates/             # Jinja templates (layouts, auth, courses)
│   └── static/                 # CSS, JS, images
├── instance/                   # Local SQLite database (gitignored)
├── migrations/                 # Flask-Migrate migration scripts
├── tests/                      # Test suite
├── scripts/                    # One-off / maintenance scripts
├── docs/                       # Project documentation
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
