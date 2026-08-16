from flask import Blueprint, render_template
from flask_login import current_user

from app.models import Enrollment

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    enrollments = []
    if current_user.is_authenticated:
        enrollments = (
            Enrollment.query.filter_by(user_id=current_user.id)
            .order_by(Enrollment.created_at.desc())
            .all()
        )
    return render_template("index.html", enrollments=enrollments)
