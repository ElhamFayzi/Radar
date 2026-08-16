"""One-time seed of demo courses and tasks, matching the original design mockup."""

from datetime import date, datetime, timedelta

from app import create_app
from app.extensions import db
from app.models import Course, Priority, Subtask, Task, TaskStatus, TaskType, Workload

COURSES = {
    "CS 251": "#7aa2f7",
    "MATH 340": "#6fcfb0",
    "PHIL 210": "#e0b060",
    "HIST 118": "#e0707c",
    "BIO 221": "#9ac96a",
    "Personal": "#9b9fb5",
}

# (course, name, type, day_offset, time, priority, workload, weight, status, subtasks, notes, recurring)
TASKS = [
    ("CS 251", "Problem Set 6 — heaps & tries", "Homework", -1, "23:59", "High", "Moderate", 8, "In Progress",
     [("Part A: heapify proof", True), ("Part B: trie insert", False)], "Submit on Gradescope", False),
    ("HIST 118", "Response paper: Reconstruction", "Paper", 0, "17:00", "Medium", "Moderate", 10, "In Progress",
     [], "", False),
    ("BIO 221", "Chapter 9 reading + quiz", "Reading", 1, "09:00", "Low", "Light", 2, "Not Started",
     [], "", True),
    ("MATH 340", "Midterm 1 (Ch. 1-4)", "Exam", 3, "10:30", "High", "Heavy", 25, "In Progress",
     [("Redo PS 1-3", True), ("Practice exam", False), ("Office hours Weds", False)], "", False),
    ("CS 251", "Project 2 — B-tree index", "Project", 5, "23:59", "High", "Heavy", 20, "Not Started",
     [("Design doc", False), ("Split/merge", False)], "Pairs allowed", False),
    ("PHIL 210", "Weekly discussion post", "Homework", 2, "22:00", "Low", "Light", 3, "Not Started",
     [], "", True),
    ("Personal", "Renew passport — photo + form", "Other", 6, "12:00", "Medium", "Light", None, "Not Started",
     [], "", False),
    ("MATH 340", "PS 5 — eigenvectors", "Homework", 4, "23:59", "Medium", "Moderate", 6, "Not Started",
     [], "", True),
    ("PHIL 210", "Essay 2 draft: Rawls", "Paper", 9, "23:59", "Medium", "Heavy", 15, "Not Started",
     [], "", False),
    ("BIO 221", "Lab report — gel electrophoresis", "Homework", 7, "20:00", "Medium", "Moderate", 7, "Not Started",
     [], "", False),
    ("HIST 118", "Primary source annotations", "Reading", 8, "23:59", "Low", "Light", 4, "Not Started",
     [], "", True),
    ("CS 251", "Quiz 4 — hashing", "Exam", 11, "09:30", "Medium", "Light", 5, "Not Started",
     [], "", False),
    ("Personal", "TA shift swap request", "Other", 2, "18:00", "Low", "Light", None, "Not Started",
     [], "", False),
    ("BIO 221", "Exam 2", "Exam", 15, "08:00", "High", "Heavy", 22, "Not Started",
     [], "", False),
    ("MATH 340", "PS 6 — diagonalization", "Homework", 11, "23:59", "Medium", "Moderate", 6, "Not Started",
     [], "", True),
    ("HIST 118", "Term paper proposal", "Paper", 13, "23:59", "High", "Moderate", 10, "Not Started",
     [], "", False),
    ("CS 251", "Problem Set 5 — graphs", "Homework", -6, "23:59", "High", "Moderate", 8, "Done",
     [], "", False),
    ("PHIL 210", "Essay 1: utilitarian calculus", "Paper", -9, "23:59", "High", "Heavy", 15, "Done",
     [], "", False),
    ("BIO 221", "Chapter 8 reading", "Reading", -3, "09:00", "Low", "Light", 2, "Done",
     [], "", True),
    ("MATH 340", "PS 4 — determinants", "Homework", -4, "23:59", "Medium", "Moderate", 6, "Done",
     [], "", False),
]


def seed():
    app = create_app()
    with app.app_context():
        if Course.query.first():
            print("Database already has data — skipping seed.")
            return

        courses_by_name = {}
        for name, color in COURSES.items():
            course = Course(name=name, color=color)
            db.session.add(course)
            courses_by_name[name] = course
        db.session.flush()

        today = date.today()
        for (course_name, name, task_type, offset, due_time, priority, workload, weight,
             status, subtasks, notes, recurring) in TASKS:
            task = Task(
                course=courses_by_name[course_name],
                name=name,
                type=TaskType(task_type),
                due_date=today + timedelta(days=offset),
                due_time=datetime.strptime(due_time, "%H:%M").time(),
                priority=Priority(priority),
                workload=Workload(workload),
                weight=weight,
                status=TaskStatus(status),
                notes=notes,
                recurring=recurring,
            )
            for text, done in subtasks:
                task.subtasks.append(Subtask(text=text, done=done))
            db.session.add(task)

        db.session.commit()
        print(f"Seeded {len(courses_by_name)} courses and {len(TASKS)} tasks.")


if __name__ == "__main__":
    seed()
