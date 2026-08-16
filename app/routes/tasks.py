import uuid
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import (
    Course,
    Priority,
    ReminderLeadTime,
    Subtask,
    Task,
    TaskStatus,
    TaskType,
    Workload,
)

tasks_bp = Blueprint("tasks", __name__, url_prefix="/api/tasks")

ENUM_FIELDS = (
    ("type", TaskType),
    ("priority", Priority),
    ("workload", Workload),
    ("status", TaskStatus),
    ("reminder", ReminderLeadTime),
)

# Recurring tasks are generated on a fixed weekly schedule, independent of
# whether earlier occurrences were completed, edited, or deleted, and this
# is how far ahead the series is kept populated.
OCCURRENCE_LOOKAHEAD_WEEKS = 8


def _create_occurrence(template, due_date):
    db.session.add(Task(
        course_id=template.course.id,
        name=template.name,
        type=template.type,
        due_date=due_date,
        due_time=template.due_time,
        priority=template.priority,
        workload=template.workload,
        weight=template.weight,
        status=TaskStatus.NOT_STARTED,
        notes=template.notes,
        recurring=True,
        reminder=template.reminder,
        series_id=template.series_id,
    ))


def _top_up_series(template):
    """Ensure `template`'s series has a weekly occurrence (on its original weekday) for every
    week from today through the lookahead horizon. Never backfills already-past weeks — if
    `template` is stale (its future occurrences were deleted), generation resumes from the
    next upcoming week instead of flooding in overdue placeholders."""
    today_ = date.today()
    horizon = today_ + timedelta(weeks=OCCURRENCE_LOOKAHEAD_WEEKS)

    due = template.due_date + timedelta(weeks=1)
    while due < today_:
        due += timedelta(weeks=1)

    created = False
    while due <= horizon:
        _create_occurrence(template, due)
        due += timedelta(weeks=1)
        created = True
    return created


def _maintain_recurring_series():
    """Top up every active recurring series so it always reaches the lookahead horizon."""
    series_ids = [
        row[0] for row in
        db.session.query(Task.series_id).filter(Task.series_id.isnot(None)).distinct()
    ]

    changed = False
    for series_id in series_ids:
        latest = Task.query.filter_by(series_id=series_id).order_by(Task.due_date.desc()).first()
        if latest is None or not latest.recurring:
            continue
        if _top_up_series(latest):
            changed = True

    if changed:
        db.session.commit()


def _apply_task_payload(task, data):
    """Apply a JSON payload's fields onto a Task. Returns an error string, or None on success."""
    if "course_id" in data:
        course = db.session.get(Course, data["course_id"])
        if course is None:
            return "unknown course_id"
        task.course = course

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return "name is required"
        task.name = name

    for field, enum_cls in ENUM_FIELDS:
        if field in data:
            try:
                value = enum_cls(data[field])
            except ValueError:
                return f"invalid {field}: {data[field]!r}"
            if field == "status":
                if value == TaskStatus.DONE and task.status != TaskStatus.DONE:
                    task.completed_at = datetime.now(timezone.utc)
                elif value != TaskStatus.DONE:
                    task.completed_at = None
            setattr(task, field, value)

    if "due_date" in data:
        try:
            task.due_date = datetime.strptime(data["due_date"], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return "due_date must be YYYY-MM-DD"

    if "due_time" in data:
        try:
            task.due_time = datetime.strptime(data["due_time"], "%H:%M").time()
        except (ValueError, TypeError):
            return "due_time must be HH:MM"

    if "weight" in data:
        task.weight = None if data["weight"] in (None, "") else float(data["weight"])

    if "notes" in data:
        task.notes = data["notes"]

    if "recurring" in data:
        task.recurring = bool(data["recurring"])

    return None


@tasks_bp.route("", methods=["GET"])
def list_tasks():
    _maintain_recurring_series()

    query = Task.query

    course_id = request.args.get("course_id", type=int)
    if course_id:
        query = query.filter_by(course_id=course_id)

    status = request.args.get("status")
    if status:
        try:
            query = query.filter_by(status=TaskStatus(status))
        except ValueError:
            return jsonify({"error": f"invalid status: {status!r}"}), 400

    tasks = query.order_by(Task.due_date, Task.due_time).all()
    return jsonify([task.to_dict() for task in tasks])


@tasks_bp.route("/<int:task_id>", methods=["GET"])
def get_task(task_id):
    task = Task.query.get_or_404(task_id)
    return jsonify(task.to_dict())


@tasks_bp.route("", methods=["POST"])
def create_task():
    data = request.get_json(silent=True) or {}
    for required in ("course_id", "name", "due_date"):
        if required not in data:
            return jsonify({"error": f"{required} is required"}), 400

    task = Task()
    error = _apply_task_payload(task, data)
    if error:
        return jsonify({"error": error}), 400

    for subtask_data in data.get("subtasks", []):
        if isinstance(subtask_data, dict):
            text = str(subtask_data.get("text", "")).strip()
            done = bool(subtask_data.get("done", False))
        else:
            text = str(subtask_data).strip()
            done = False
        if text:
            task.subtasks.append(Subtask(text=text, done=done))

    db.session.add(task)

    if task.recurring:
        task.series_id = uuid.uuid4().hex
        _top_up_series(task)

    db.session.commit()
    return jsonify(task.to_dict()), 201


@tasks_bp.route("/<int:task_id>", methods=["PATCH"])
def update_task(task_id):
    task = Task.query.get_or_404(task_id)
    data = request.get_json(silent=True) or {}
    was_recurring = task.recurring

    error = _apply_task_payload(task, data)
    if error:
        return jsonify({"error": error}), 400

    if task.recurring and not was_recurring and not task.series_id:
        task.series_id = uuid.uuid4().hex
        _top_up_series(task)

    db.session.commit()
    return jsonify(task.to_dict())


@tasks_bp.route("/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    task = Task.query.get_or_404(task_id)
    db.session.delete(task)
    db.session.commit()
    return "", 204


@tasks_bp.route("/<int:task_id>/subtasks", methods=["POST"])
def add_subtask(task_id):
    task = Task.query.get_or_404(task_id)
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    subtask = Subtask(task=task, text=text)
    db.session.add(subtask)
    db.session.commit()
    return jsonify(subtask.to_dict()), 201


@tasks_bp.route("/<int:task_id>/subtasks/<int:subtask_id>", methods=["PATCH"])
def update_subtask(task_id, subtask_id):
    subtask = Subtask.query.filter_by(id=subtask_id, task_id=task_id).first_or_404()
    data = request.get_json(silent=True) or {}

    if "done" in data:
        subtask.done = bool(data["done"])
    if "text" in data:
        subtask.text = data["text"].strip()

    db.session.commit()
    return jsonify(subtask.to_dict())


@tasks_bp.route("/<int:task_id>/subtasks/<int:subtask_id>", methods=["DELETE"])
def delete_subtask(task_id, subtask_id):
    subtask = Subtask.query.filter_by(id=subtask_id, task_id=task_id).first_or_404()
    db.session.delete(subtask)
    db.session.commit()
    return "", 204
