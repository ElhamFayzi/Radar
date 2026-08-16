from flask import Flask

from app.extensions import db, migrate
from config import Config


def create_app(config_class=Config):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    from app.routes.courses import courses_bp
    from app.routes.main import main_bp
    from app.routes.tasks import tasks_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(courses_bp)
    app.register_blueprint(tasks_bp)

    return app
