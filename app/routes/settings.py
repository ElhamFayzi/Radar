from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import ReminderLeadTime, Settings

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@settings_bp.route("", methods=["GET"])
def get_settings():
    return jsonify(Settings.get().to_dict())


@settings_bp.route("", methods=["PATCH"])
def update_settings():
    settings = Settings.get()
    data = request.get_json(silent=True) or {}

    if "default_reminder" in data:
        try:
            settings.default_reminder = ReminderLeadTime(data["default_reminder"])
        except ValueError:
            return jsonify({"error": f"invalid default_reminder: {data['default_reminder']!r}"}), 400

    db.session.commit()
    return jsonify(settings.to_dict())
