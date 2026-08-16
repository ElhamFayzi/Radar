import csv
import io

from flask import Blueprint, Response

from app.models import Course, Task, TaskStatus

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


@export_bp.route("/export.csv")
def export_csv():
    tasks = Task.query.join(Course).order_by(Course.name, Task.due_date, Task.due_time).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "Course", "Assignment", "Type", "Due Date", "Due Time", "Priority",
        "Workload", "Weight (%)", "Status", "Recurring", "Reminder",
        "Notes", "Subtasks",
    ])
    for task in tasks:
        subtasks = "; ".join(f"[{'x' if s.done else ' '}] {s.text}" for s in task.subtasks)
        writer.writerow([
            task.course.name,
            task.name,
            task.type.value,
            task.due_date.isoformat(),
            task.due_time.strftime("%H:%M"),
            task.priority.value,
            task.workload.value,
            task.weight if task.weight is not None else "",
            task.status.value,
            "Yes" if task.recurring else "No",
            task.reminder.value,
            task.notes or "",
            subtasks,
        ])

    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=coursework.csv"},
    )
