from flask import Blueprint, Response

from app.models import Task, TaskStatus

export_bp = Blueprint("export", __name__)


def _escape_ics(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@export_bp.route("/export.ics")
def export_ics():
    tasks = (
        Task.query.filter(Task.status != TaskStatus.DONE)
        .order_by(Task.due_date, Task.due_time)
        .all()
    )

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radar//Coursework Tracker//EN", "CALSCALE:GREGORIAN"]
    for task in tasks:
        dtstart = f"{task.due_date:%Y%m%d}T{task.due_time:%H%M%S}"

        description_parts = []
        if task.notes:
            description_parts.append(task.notes)
        if task.weight is not None:
            description_parts.append(f"Worth {task.weight:g}% of grade")
        description = _escape_ics("\n".join(description_parts))

        lines += [
            "BEGIN:VEVENT",
            f"UID:task-{task.id}@radar.local",
            f"DTSTART:{dtstart}",
            f"SUMMARY:{_escape_ics(f'[{task.course.name}] {task.name}')}",
        ]
        if description:
            lines.append(f"DESCRIPTION:{description}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")

    body = "\r\n".join(lines) + "\r\n"
    return Response(
        body,
        mimetype="text/calendar",
        headers={"Content-Disposition": "attachment; filename=coursework.ics"},
    )
