import socket
import threading

import pytest
from werkzeug.serving import make_server

from app import create_app
from app.extensions import db
from app.models import Course, Settings, Task
from config import Config


class E2EConfig(Config):
    TESTING = True


def _free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="session")
def flask_app(tmp_path_factory):
    """One Flask app for the whole E2E session, backed by an isolated temp-file
    SQLite DB — never the real instance/radar.db."""
    db_path = tmp_path_factory.mktemp("e2e") / "radar_e2e.db"
    E2EConfig.SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"

    app = create_app(E2EConfig)
    with app.app_context():
        db.create_all()

    return app


@pytest.fixture(scope="session")
def base_url(flask_app):
    """Serves the app over real HTTP so Playwright can drive a real browser
    against it. pytest-playwright's `page` fixture auto-discovers this
    fixture name and uses it to resolve relative page.goto() calls."""
    port = _free_port()
    server = make_server("127.0.0.1", port, flask_app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    yield f"http://127.0.0.1:{port}"

    server.shutdown()
    thread.join()


@pytest.fixture(autouse=True)
def reset_db(flask_app):
    """Every E2E test starts from a completely empty, known-clean database."""
    with flask_app.app_context():
        Task.query.delete()
        Course.query.delete()
        Settings.query.delete()
        db.session.commit()
    yield


@pytest.fixture
def course(page, base_url):
    res = page.request.post(f"{base_url}/api/courses", data={"name": "CS 101", "color": "#7aa2f7"})
    return res.json()
