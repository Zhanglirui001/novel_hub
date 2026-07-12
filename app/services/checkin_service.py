from datetime import date, timedelta

from app.database import get_conn, utc_now, utc_today


class CheckinService:
    def _ensure_project(self, cursor, project_id: int) -> None:
        cursor.execute("SELECT id FROM projects WHERE id = %s", (project_id,))
        if not cursor.fetchone():
            raise ValueError(f"project_id={project_id} 不存在")

    @staticmethod
    def _current_streak(checkin_dates: list[date], today: date) -> int:
        dates = set(checkin_dates)
        streak = 0
        current = today
        while current in dates:
            streak += 1
            current -= timedelta(days=1)
        return streak

    @staticmethod
    def can_check_in(total_count: int, completed_count: int) -> bool:
        return total_count > 0 and total_count == completed_count

    def _is_locked(self, cursor, project_id: int, today: str) -> bool:
        cursor.execute(
            "SELECT id FROM daily_checkins WHERE project_id = %s AND checkin_date = %s",
            (project_id, today),
        )
        return cursor.fetchone() is not None

    def _summary(self, cursor, project_id: int, today: str) -> dict:
        cursor.execute(
            """
            SELECT id, content, completed, sort_order, created_at, completed_at
            FROM daily_todos
            WHERE project_id = %s AND todo_date = %s
            ORDER BY sort_order ASC, id ASC
            """,
            (project_id, today),
        )
        todos = list(cursor.fetchall())
        for todo in todos:
            todo["completed"] = bool(todo["completed"])

        total_count = len(todos)
        completed_count = sum(todo["completed"] for todo in todos)
        locked = self._is_locked(cursor, project_id, today)
        cursor.execute(
            "SELECT checkin_date FROM daily_checkins WHERE project_id = %s AND checkin_date <= %s",
            (project_id, today),
        )
        checkin_dates = [row["checkin_date"] for row in cursor.fetchall()]
        parsed_dates = [value if isinstance(value, date) else date.fromisoformat(str(value)) for value in checkin_dates]

        return {
            "project_id": project_id,
            "date": today,
            "todos": todos,
            "total_count": total_count,
            "completed_count": completed_count,
            "checked_in": locked,
            "locked": locked,
            "current_streak": self._current_streak(parsed_dates, date.fromisoformat(today)),
        }

    def get_today(self, project_id: int) -> dict:
        today = utc_today()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            return self._summary(cursor, project_id, today)

    def create_todo(self, project_id: int, content: str) -> dict:
        today = utc_today()
        now = utc_now()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            if self._is_locked(cursor, project_id, today):
                raise ValueError("今日已签到，待办不可修改")
            cursor.execute(
                """
                SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
                FROM daily_todos WHERE project_id = %s AND todo_date = %s
                """,
                (project_id, today),
            )
            sort_order = cursor.fetchone()["next_order"]
            cursor.execute(
                """
                INSERT INTO daily_todos (project_id, todo_date, content, completed, sort_order, created_at)
                VALUES (%s, %s, %s, FALSE, %s, %s)
                """,
                (project_id, today, content, sort_order, now),
            )
            return self._summary(cursor, project_id, today)

    def update_todo(self, project_id: int, todo_id: int, content: str | None, completed: bool | None) -> dict:
        today = utc_today()
        now = utc_now()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            if self._is_locked(cursor, project_id, today):
                raise ValueError("今日已签到，待办不可修改")
            cursor.execute(
                """
                SELECT id FROM daily_todos
                WHERE id = %s AND project_id = %s AND todo_date = %s
                """,
                (todo_id, project_id, today),
            )
            if not cursor.fetchone():
                raise ValueError(f"todo_id={todo_id} 不存在或不属于今日待办")

            updates = []
            values = []
            if content is not None:
                updates.append("content = %s")
                values.append(content)
            if completed is not None:
                updates.extend(["completed = %s", "completed_at = %s"])
                values.extend([completed, now if completed else None])
            if not updates:
                return self._summary(cursor, project_id, today)

            values.append(todo_id)
            cursor.execute(f"UPDATE daily_todos SET {', '.join(updates)} WHERE id = %s", values)
            return self._summary(cursor, project_id, today)

    def delete_todo(self, project_id: int, todo_id: int) -> dict:
        today = utc_today()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            if self._is_locked(cursor, project_id, today):
                raise ValueError("今日已签到，待办不可修改")
            cursor.execute(
                """
                DELETE FROM daily_todos
                WHERE id = %s AND project_id = %s AND todo_date = %s
                """,
                (todo_id, project_id, today),
            )
            if cursor.rowcount == 0:
                raise ValueError(f"todo_id={todo_id} 不存在或不属于今日待办")
            return self._summary(cursor, project_id, today)

    def check_in(self, project_id: int) -> dict:
        today = utc_today()
        now = utc_now()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            summary = self._summary(cursor, project_id, today)
            if not summary["checked_in"] and not self.can_check_in(summary["total_count"], summary["completed_count"]):
                raise ValueError("请先完成今日全部待办后再签到")
            cursor.execute(
                """
                INSERT INTO daily_checkins (project_id, checkin_date, completed_at)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE completed_at = completed_at
                """,
                (project_id, today, now),
            )
            return self._summary(cursor, project_id, today)
