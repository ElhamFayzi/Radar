from datetime import datetime, timezone
from typing import List, Optional

from app.extensions import db


class Course(db.Model):
    __tablename__ = "courses"

    id: db.Mapped[int] = db.mapped_column(primary_key=True)
    title: db.Mapped[str] = db.mapped_column(db.String(200), nullable=False)
    provider: db.Mapped[Optional[str]] = db.mapped_column(db.String(120))
    url: db.Mapped[Optional[str]] = db.mapped_column(db.String(500))
    description: db.Mapped[Optional[str]] = db.mapped_column(db.Text)
    created_at: db.Mapped[datetime] = db.mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    enrollments: db.Mapped[List["Enrollment"]] = db.relationship(
        back_populates="course", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Course {self.title}>"
