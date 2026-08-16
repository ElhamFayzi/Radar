from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import Course

courses_bp = Blueprint("courses", __name__, url_prefix="/api/courses")


@courses_bp.route("", methods=["GET"])
def list_courses():
    courses = Course.query.order_by(Course.name).all()
    return jsonify([course.to_dict() for course in courses])


@courses_bp.route("", methods=["POST"])
def create_course():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    color = (data.get("color") or "#9b9fb5").strip()

    if not name:
        return jsonify({"error": "name is required"}), 400
    if Course.query.filter_by(name=name).first():
        return jsonify({"error": "a course with that name already exists"}), 409

    course = Course(name=name, color=color)
    db.session.add(course)
    db.session.commit()
    return jsonify(course.to_dict()), 201


@courses_bp.route("/<int:course_id>", methods=["PATCH"])
def update_course(course_id):
    course = Course.query.get_or_404(course_id)
    data = request.get_json(silent=True) or {}

    if "name" in data:
        course.name = data["name"].strip()
    if "color" in data:
        course.color = data["color"].strip()

    db.session.commit()
    return jsonify(course.to_dict())


@courses_bp.route("/<int:course_id>", methods=["DELETE"])
def delete_course(course_id):
    course = Course.query.get_or_404(course_id)
    db.session.delete(course)
    db.session.commit()
    return "", 204
