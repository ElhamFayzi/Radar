from app.extensions import db
from app.models.task import ReminderLeadTime


class Settings(db.Model):
    """Single-row table of app-wide preferences for this local user."""

    __tablename__ = "settings"

    id: db.Mapped[int] = db.mapped_column(primary_key=True)
    default_reminder: db.Mapped[ReminderLeadTime] = db.mapped_column(
        db.Enum(ReminderLeadTime), default=ReminderLeadTime.TWO_DAYS_BEFORE, nullable=False
    )

    @classmethod
    def get(cls) -> "Settings":
        settings = cls.query.first()
        if settings is None:
            settings = cls()
            db.session.add(settings)
            db.session.commit()
        return settings

    def to_dict(self) -> dict:
        return {"default_reminder": self.default_reminder.value}
