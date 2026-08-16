from datetime import datetime, timezone

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from app.extensions import db
from app.models import Course, Enrollment, EnrollmentStatus

courses_bp = Blueprint("courses", __name__, url_prefix="/courses")


@courses_bp.route("/")
def list_courses():
    courses = Course.query.order_by(Course.title).all()
    return render_template("courses/list.html", courses=courses)


@courses_bp.route("/new", methods=["GET", "POST"])
@login_required
def new_course():
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        provider = request.form.get("provider", "").strip() or None
        course_url = request.form.get("url", "").strip() or None
        description = request.form.get("description", "").strip() or None

        if not title:
            flash("Title is required.", "error")
        else:
            course = Course(
                title=title, provider=provider, url=course_url, description=description
            )
            db.session.add(course)
            db.session.commit()
            flash("Course added.", "success")
            return redirect(url_for("courses.detail", course_id=course.id))

    return render_template("courses/new.html")


@courses_bp.route("/<int:course_id>")
def detail(course_id):
    course = Course.query.get_or_404(course_id)
    enrollment = None
    if current_user.is_authenticated:
        enrollment = Enrollment.query.filter_by(
            user_id=current_user.id, course_id=course.id
        ).first()
    return render_template("courses/detail.html", course=course, enrollment=enrollment)


@courses_bp.route("/<int:course_id>/enroll", methods=["POST"])
@login_required
def enroll(course_id):
    course = Course.query.get_or_404(course_id)
    existing = Enrollment.query.filter_by(user_id=current_user.id, course_id=course.id).first()
    if existing is None:
        db.session.add(Enrollment(user_id=current_user.id, course_id=course.id))
        db.session.commit()
        flash(f"Enrolled in {course.title}.", "success")
    return redirect(url_for("courses.detail", course_id=course.id))


@courses_bp.route("/<int:course_id>/progress", methods=["POST"])
@login_required
def update_progress(course_id):
    enrollment = Enrollment.query.filter_by(
        user_id=current_user.id, course_id=course_id
    ).first_or_404()

    status = request.form.get("status")
    if status in EnrollmentStatus._value2member_map_:
        enrollment.status = EnrollmentStatus(status)

    progress_percent = request.form.get("progress_percent")
    if progress_percent is not None and progress_percent.isdigit():
        enrollment.progress_percent = max(0, min(100, int(progress_percent)))

    if enrollment.status == EnrollmentStatus.IN_PROGRESS and enrollment.started_at is None:
        enrollment.started_at = datetime.now(timezone.utc)
    if enrollment.status == EnrollmentStatus.COMPLETED and enrollment.completed_at is None:
        enrollment.completed_at = datetime.now(timezone.utc)
        enrollment.progress_percent = 100

    db.session.commit()
    flash("Progress updated.", "success")
    return redirect(url_for("courses.detail", course_id=course_id))


@courses_bp.route("/<int:course_id>/delete", methods=["POST"])
@login_required
def delete_course(course_id):
    course = Course.query.get_or_404(course_id)
    db.session.delete(course)
    db.session.commit()
    flash("Course deleted.", "success")
    return redirect(url_for("courses.list_courses"))
