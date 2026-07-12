from datetime import date, timedelta

from app.database import get_conn, utc_now, utc_today


class CheckinService:
    @staticmethod
    def _weekdays_value(weekdays: list[int]) -> str:
        unique = sorted(set(weekdays))
        if not unique or any(day < 0 or day > 6 for day in unique):
            raise ValueError("星期必须是 0 至 6 的整数")
        return ",".join(str(day) for day in unique)

    @staticmethod
    def _weekdays_list(value: str) -> list[int]:
        return [int(day) for day in value.split(",") if day]

    def _future_days_for_template(self, month: str, weekdays: list[int]) -> list[str]:
        month_start = self._parse_month(month)
        month_end = self._month_end(month_start)
        today = self._parse_day(utc_today())
        days = []
        current = max(month_start, today)
        while current < month_end:
            if current.weekday() in weekdays:
                days.append(current.isoformat())
            current += timedelta(days=1)
        return days

    def _sync_template(self, cursor, project_id: int, template_id: int, month: str, content: str, weekdays: list[int]) -> None:
        today = utc_today()
        month_end = self._month_end(self._parse_month(month)).isoformat()
        target_days = self._future_days_for_template(month, weekdays)
        if target_days:
            placeholders = ",".join(["%s"] * len(target_days))
            cursor.execute(
                f"""
                DELETE FROM daily_todos
                WHERE project_id = %s AND template_id = %s AND is_customized = FALSE
                    AND todo_date >= %s AND todo_date < %s AND todo_date NOT IN ({placeholders})
                """,
                (project_id, template_id, today, month_end, *target_days),
            )
        else:
            cursor.execute(
                """
                DELETE FROM daily_todos
                WHERE project_id = %s AND template_id = %s AND is_customized = FALSE
                    AND todo_date >= %s AND todo_date < %s
                """,
                (project_id, template_id, today, month_end),
            )
        now = utc_now()
        for day in target_days:
            cursor.execute(
                """
                SELECT id FROM daily_todos
                WHERE project_id = %s AND todo_date = %s AND template_id = %s AND is_customized = FALSE
                """,
                (project_id, day, template_id),
            )
            row = cursor.fetchone()
            if row:
                cursor.execute("UPDATE daily_todos SET content = %s WHERE id = %s", (content, row["id"]))
                continue
            cursor.execute(
                """
                SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
                FROM daily_todos WHERE project_id = %s AND todo_date = %s
                """,
                (project_id, day),
            )
            cursor.execute(
                """
                INSERT INTO daily_todos
                    (project_id, todo_date, content, completed, template_id, is_customized, sort_order, created_at)
                VALUES (%s, %s, %s, FALSE, %s, FALSE, %s, %s)
                """,
                (project_id, day, content, template_id, cursor.fetchone()["next_order"], now),
            )

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

    def _summary(self, cursor, project_id: int, day: str) -> dict:
        selected_day = self._parse_day(day)
        today = self._parse_day(utc_today())
        if selected_day > today:
            raise ValueError("不能查看未来日期")
        cursor.execute(
            """
            SELECT id, content, completed, sort_order, created_at, completed_at
            FROM daily_todos
            WHERE project_id = %s AND todo_date = %s
            ORDER BY sort_order ASC, id ASC
            """,
            (project_id, day),
        )
        todos = list(cursor.fetchall())
        for todo in todos:
            todo["completed"] = bool(todo["completed"])

        total_count = len(todos)
        completed_count = sum(todo["completed"] for todo in todos)
        checked_in = self._is_locked(cursor, project_id, day)
        cursor.execute(
            "SELECT checkin_date FROM daily_checkins WHERE project_id = %s AND checkin_date <= %s",
            (project_id, today.isoformat()),
        )
        checkin_dates = [row["checkin_date"] for row in cursor.fetchall()]
        parsed_dates = [value if isinstance(value, date) else date.fromisoformat(str(value)) for value in checkin_dates]

        return {
            "project_id": project_id,
            "date": day,
            "todos": todos,
            "total_count": total_count,
            "completed_count": completed_count,
            "checked_in": checked_in,
            "locked": selected_day < today or checked_in,
            "current_streak": self._current_streak(parsed_dates, today),
        }

    def get_day(self, project_id: int, day: str) -> dict:
        self._parse_day(day)
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            return self._summary(cursor, project_id, day)

    def get_today(self, project_id: int) -> dict:
        return self.get_day(project_id, utc_today())

    def get_month(self, project_id: int, month: str) -> dict:
        month_start = self._parse_month(month)
        month_end = self._month_end(month_start)
        today = self._parse_day(utc_today())
        if month_start > today.replace(day=1):
            raise ValueError("不能查看未来月份")

        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            cursor.execute(
                """
                SELECT todo_date AS date, COUNT(*) AS total_count,
                    COALESCE(SUM(CASE WHEN completed THEN 1 ELSE 0 END), 0) AS completed_count
                FROM daily_todos
                WHERE project_id = %s AND todo_date >= %s AND todo_date < %s
                GROUP BY todo_date
                """,
                (project_id, month_start.isoformat(), month_end.isoformat()),
            )
            days = {
                str(row["date"]): {
                    "date": str(row["date"]),
                    "total_count": int(row["total_count"]),
                    "completed_count": int(row["completed_count"]),
                    "checked_in": False,
                }
                for row in cursor.fetchall()
            }
            cursor.execute(
                """
                SELECT checkin_date AS date FROM daily_checkins
                WHERE project_id = %s AND checkin_date >= %s AND checkin_date < %s
                """,
                (project_id, month_start.isoformat(), month_end.isoformat()),
            )
            for row in cursor.fetchall():
                day = str(row["date"])
                days.setdefault(
                    day,
                    {"date": day, "total_count": 0, "completed_count": 0, "checked_in": False},
                )["checked_in"] = True

        return {
            "project_id": project_id,
            "month": month,
            "today": today.isoformat(),
            "days": [days[key] for key in sorted(days)],
        }

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
