from datetime import datetime, timezone
from typing import List

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id: db.Mapped[int] = db.mapped_column(primary_key=True)
    username: db.Mapped[str] = db.mapped_column(db.String(80), unique=True, nullable=False)
    email: db.Mapped[str] = db.mapped_column(db.String(120), unique=True, nullable=False)
    password_hash: db.Mapped[str] = db.mapped_column(db.String(255), nullable=False)
    created_at: db.Mapped[datetime] = db.mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    enrollments: db.Mapped[List["Enrollment"]] = db.relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def __repr__(self) -> str:
        return f"<User {self.username}>"
