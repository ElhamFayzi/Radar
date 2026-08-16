from datetime import datetime, timezone
from typing import List

from app.extensions import db


class Course(db.Model):
    __tablename__ = "courses"

    id: db.Mapped[int] = db.mapped_column(primary_key=True)
    name: db.Mapped[str] = db.mapped_column(db.String(80), unique=True, nullable=False)
    color: db.Mapped[str] = db.mapped_column(db.String(7), nullable=False, default="#9b9fb5")
    created_at: db.Mapped[datetime] = db.mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    tasks: db.Mapped[List["Task"]] = db.relationship(
        back_populates="course", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "color": self.color}

    def __repr__(self) -> str:
        return f"<Course {self.name}>"
