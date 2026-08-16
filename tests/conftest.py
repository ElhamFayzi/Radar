import os
import tempfile

import pytest

from app import create_app
from app.extensions import db
from config import Config


class TestConfig(Config):
    TESTING = True


@pytest.fixture
def app():
    """A Flask app backed by a fresh, isolated temp-file SQLite DB per test.

    Never touches the real instance/radar.db.
    """
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    TestConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"

    flask_app = create_app(TestConfig)
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()

    os.close(db_fd)
    os.remove(db_path)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def course(client):
    """A single ready-to-use course."""
    res = client.post("/api/courses", json={"name": "CS 101", "color": "#7aa2f7"})
    return res.get_json()


def make_task(client, course_id, **overrides):
    payload = {
        "course_id": course_id,
        "name": "Test task",
        "due_date": "2026-01-15",
    }
    payload.update(overrides)
    return client.post("/api/tasks", json=payload)
