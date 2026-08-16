import enum
from datetime import date, datetime, time, timezone
from typing import List, Optional

from app.extensions import db


class TaskType(str, enum.Enum):
    HOMEWORK = "Homework"
    EXAM = "Exam"
    PROJECT = "Project"
    READING = "Reading"
    PAPER = "Paper"
    OTHER = "Other"


class Priority(str, enum.Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class Workload(str, enum.Enum):
    LIGHT = "Light"
    MODERATE = "Moderate"
    HEAVY = "Heavy"


class TaskStatus(str, enum.Enum):
    NOT_STARTED = "Not Started"
    IN_PROGRESS = "In Progress"
    DONE = "Done"


class ReminderLeadTime(str, enum.Enum):
    NONE = "No reminder"
    DAY_OF = "Day of"
    ONE_DAY_BEFORE = "1 day before"
    TWO_DAYS_BEFORE = "2 days before"
    ONE_WEEK_BEFORE = "1 week before"


class Task(db.Model):
    __tablename__ = "tasks"

    id: db.Mapped[int] = db.mapped_column(primary_key=True)
    course_id: db.Mapped[int] = db.mapped_column(db.ForeignKey("courses.id"), nullable=False)
    name: db.Mapped[str] = db.mapped_column(db.String(200), nullable=False)
    type: db.Mapped[TaskType] = db.mapped_column(
        db.Enum(TaskType), default=TaskType.HOMEWORK, nullable=False
    )
    due_date: db.Mapped[date] = db.mapped_column(nullable=False)
    due_time: db.Mapped[time] = db.mapped_column(default=lambda: time(23, 59), nullable=False)
    priority: db.Mapped[Priority] = db.mapped_column(
        db.Enum(Priority), default=Priority.MEDIUM, nullable=False
    )
    workload: db.Mapped[Workload] = db.mapped_column(
        db.Enum(Workload), default=Workload.MODERATE, nullable=False
    )
    weight: db.Mapped[Optional[float]] = db.mapped_column(default=None)
    status: db.Mapped[TaskStatus] = db.mapped_column(
        db.Enum(TaskStatus), default=TaskStatus.NOT_STARTED, nullable=False
    )
    notes: db.Mapped[Optional[str]] = db.mapped_column(db.Text)
    recurring: db.Mapped[bool] = db.mapped_column(default=False, nullable=False)
    reminder: db.Mapped[ReminderLeadTime] = db.mapped_column(
        db.Enum(ReminderLeadTime), default=ReminderLeadTime.TWO_DAYS_BEFORE, nullable=False
    )
    spent_hours: db.Mapped[float] = db.mapped_column(default=0, nullable=False)
    created_at: db.Mapped[datetime] = db.mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    course: db.Mapped["Course"] = db.relationship(back_populates="tasks")
    subtasks: db.Mapped[List["Subtask"]] = db.relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Subtask.id"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "course": self.course.to_dict(),
            "name": self.name,
            "type": self.type.value,
            "due_date": self.due_date.isoformat(),
            "due_time": self.due_time.strftime("%H:%M"),
            "priority": self.priority.value,
            "workload": self.workload.value,
            "weight": self.weight,
            "status": self.status.value,
            "notes": self.notes,
            "recurring": self.recurring,
            "reminder": self.reminder.value,
            "spent_hours": self.spent_hours,
            "subtasks": [subtask.to_dict() for subtask in self.subtasks],
        }

    def __repr__(self) -> str:
        return f"<Task {self.name}>"
