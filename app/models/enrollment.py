import enum
from datetime import datetime, timezone
from typing import Optional

from app.extensions import db


class EnrollmentStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Enrollment(db.Model):
    __tablename__ = "enrollments"
    __table_args__ = (
        db.UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),
    )

    id: db.Mapped[int] = db.mapped_column(primary_key=True)
    user_id: db.Mapped[int] = db.mapped_column(db.ForeignKey("users.id"), nullable=False)
    course_id: db.Mapped[int] = db.mapped_column(db.ForeignKey("courses.id"), nullable=False)
    status: db.Mapped[EnrollmentStatus] = db.mapped_column(
        db.Enum(EnrollmentStatus), default=EnrollmentStatus.NOT_STARTED, nullable=False
    )
    progress_percent: db.Mapped[int] = db.mapped_column(default=0, nullable=False)
    started_at: db.Mapped[Optional[datetime]] = db.mapped_column(default=None)
    completed_at: db.Mapped[Optional[datetime]] = db.mapped_column(default=None)
    notes: db.Mapped[Optional[str]] = db.mapped_column(db.Text)
    created_at: db.Mapped[datetime] = db.mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    user: db.Mapped["User"] = db.relationship(back_populates="enrollments")
    course: db.Mapped["Course"] = db.relationship(back_populates="enrollments")

    def __repr__(self) -> str:
        return f"<Enrollment user={self.user_id} course={self.course_id} status={self.status}>"
