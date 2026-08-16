from app.extensions import db


class Subtask(db.Model):
    __tablename__ = "subtasks"

    id: db.Mapped[int] = db.mapped_column(primary_key=True)
    task_id: db.Mapped[int] = db.mapped_column(db.ForeignKey("tasks.id"), nullable=False)
    text: db.Mapped[str] = db.mapped_column(db.String(300), nullable=False)
    done: db.Mapped[bool] = db.mapped_column(default=False, nullable=False)

    task: db.Mapped["Task"] = db.relationship(back_populates="subtasks")

    def to_dict(self) -> dict:
        return {"id": self.id, "text": self.text, "done": self.done}

    def __repr__(self) -> str:
        return f"<Subtask {self.text}>"
