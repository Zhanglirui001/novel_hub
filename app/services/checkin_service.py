from datetime import date, timedelta

from app.database import get_conn, utc_now, utc_today


class CheckinService:
    MAKEUP_CARDS_PER_MONTH = 8

    @staticmethod
    def _parse_day(value: str) -> date:
        try:
            return date.fromisoformat(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("日期格式必须为 YYYY-MM-DD") from exc

    @staticmethod
    def _parse_month(value: str) -> date:
        try:
            return date.fromisoformat(f"{value}-01")
        except (TypeError, ValueError) as exc:
            raise ValueError("月份格式必须为 YYYY-MM") from exc

    @staticmethod
    def _month_end(month_start: date) -> date:
        if month_start.month == 12:
            return date(month_start.year + 1, 1, 1)
        return date(month_start.year, month_start.month + 1, 1)

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

    @staticmethod
    def _weekdays_value(weekdays: list[int]) -> str:
        unique = sorted(set(weekdays))
        if not unique or any(day < 0 or day > 6 for day in unique):
            raise ValueError("星期必须是 0 至 6 的整数")
        return ",".join(str(day) for day in unique)

    @staticmethod
    def _weekdays_list(value: str) -> list[int]:
        return [int(day) for day in value.split(",") if day]

    def _ensure_project(self, cursor, project_id: int) -> None:
        cursor.execute("SELECT id FROM projects WHERE id = %s", (project_id,))
        if not cursor.fetchone():
            raise ValueError(f"project_id={project_id} 不存在")

    def _is_checked_in(self, cursor, project_id: int, day: str) -> bool:
        cursor.execute(
            "SELECT id FROM daily_checkins WHERE project_id = %s AND checkin_date = %s",
            (project_id, day),
        )
        return cursor.fetchone() is not None

    def _makeup_used(self, cursor, project_id: int, month_start: date) -> int:
        month_end = self._month_end(month_start)
        cursor.execute(
            """
            SELECT COUNT(*) AS used FROM daily_checkins
            WHERE project_id = %s AND is_makeup = TRUE
                AND checkin_date >= %s AND checkin_date < %s
            """,
            (project_id, month_start.isoformat(), month_end.isoformat()),
        )
        return int(cursor.fetchone()["used"])

    def _summary(self, cursor, project_id: int, day: str) -> dict:
        selected_day = self._parse_day(day)
        today = self._parse_day(utc_today())
        cursor.execute(
            """
            SELECT id, content, completed, template_id, is_customized, sort_order, created_at, completed_at
            FROM daily_todos
            WHERE project_id = %s AND todo_date = %s
            ORDER BY sort_order ASC, id ASC
            """,
            (project_id, day),
        )
        todos = list(cursor.fetchall())
        for todo in todos:
            todo["completed"] = bool(todo["completed"])
            todo["is_customized"] = bool(todo["is_customized"])

        total_count = len(todos)
        completed_count = sum(todo["completed"] for todo in todos)
        checked_in = self._is_checked_in(cursor, project_id, day)
        cursor.execute(
            "SELECT checkin_date FROM daily_checkins WHERE project_id = %s AND checkin_date <= %s",
            (project_id, today.isoformat()),
        )
        checkin_dates = [row["checkin_date"] for row in cursor.fetchall()]
        parsed_dates = [value if isinstance(value, date) else date.fromisoformat(str(value)) for value in checkin_dates]

        makeup_used = self._makeup_used(cursor, project_id, selected_day.replace(day=1))
        makeup_remaining = max(0, self.MAKEUP_CARDS_PER_MONTH - makeup_used)
        can_make_up = selected_day < today and not checked_in and makeup_remaining > 0

        return {
            "project_id": project_id,
            "date": day,
            "todos": todos,
            "total_count": total_count,
            "completed_count": completed_count,
            "checked_in": checked_in,
            "locked": selected_day < today or checked_in,
            "current_streak": self._current_streak(parsed_dates, today),
            "makeup_total": self.MAKEUP_CARDS_PER_MONTH,
            "makeup_used": makeup_used,
            "makeup_remaining": makeup_remaining,
            "can_make_up": can_make_up,
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
                    "is_makeup": False,
                }
                for row in cursor.fetchall()
            }
            cursor.execute(
                """
                SELECT checkin_date AS date, is_makeup FROM daily_checkins
                WHERE project_id = %s AND checkin_date >= %s AND checkin_date < %s
                """,
                (project_id, month_start.isoformat(), month_end.isoformat()),
            )
            for row in cursor.fetchall():
                day = str(row["date"])
                status = days.setdefault(
                    day, {"date": day, "total_count": 0, "completed_count": 0, "checked_in": False, "is_makeup": False}
                )
                status["checked_in"] = True
                status["is_makeup"] = bool(row["is_makeup"])

        return {
            "project_id": project_id,
            "month": month,
            "today": utc_today(),
            "days": [days[key] for key in sorted(days)],
        }

    def _editable_day(self, cursor, project_id: int, day: str) -> date:
        selected_day = self._parse_day(day)
        today = self._parse_day(utc_today())
        if selected_day < today or self._is_checked_in(cursor, project_id, day):
            raise ValueError("过去日期或已签到日期的待办不可修改")
        return selected_day

    def create_todo(self, project_id: int, content: str, day: str) -> dict:
        self._parse_day(day)
        now = utc_now()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            self._editable_day(cursor, project_id, day)
            cursor.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM daily_todos WHERE project_id = %s AND todo_date = %s",
                (project_id, day),
            )
            cursor.execute(
                """
                INSERT INTO daily_todos (project_id, todo_date, content, completed, sort_order, created_at)
                VALUES (%s, %s, %s, FALSE, %s, %s)
                """,
                (project_id, day, content, cursor.fetchone()["next_order"], now),
            )
            return self._summary(cursor, project_id, day)

    def update_todo(self, project_id: int, todo_id: int, day: str, content: str | None, completed: bool | None) -> dict:
        selected_day = self._parse_day(day)
        today = self._parse_day(utc_today())
        now = utc_now()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            self._editable_day(cursor, project_id, day)
            if completed is not None and selected_day > today:
                raise ValueError("未来待办不能提前完成")
            cursor.execute(
                "SELECT id FROM daily_todos WHERE id = %s AND project_id = %s AND todo_date = %s",
                (todo_id, project_id, day),
            )
            if not cursor.fetchone():
                raise ValueError(f"todo_id={todo_id} 不存在或不属于该日待办")
            updates, values = [], []
            if content is not None:
                updates.extend(["content = %s", "is_customized = TRUE"])
                values.append(content)
            if completed is not None:
                updates.extend(["completed = %s", "completed_at = %s"])
                values.extend([completed, now if completed else None])
            if updates:
                values.append(todo_id)
                cursor.execute(f"UPDATE daily_todos SET {', '.join(updates)} WHERE id = %s", values)
            return self._summary(cursor, project_id, day)

    def delete_todo(self, project_id: int, todo_id: int, day: str) -> dict:
        self._parse_day(day)
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            self._editable_day(cursor, project_id, day)
            cursor.execute(
                "DELETE FROM daily_todos WHERE id = %s AND project_id = %s AND todo_date = %s",
                (todo_id, project_id, day),
            )
            if cursor.rowcount == 0:
                raise ValueError(f"todo_id={todo_id} 不存在或不属于该日待办")
            return self._summary(cursor, project_id, day)

    def _future_template_days(self, month: str, weekdays: list[int]) -> list[str]:
        month_start = self._parse_month(month)
        month_end = self._month_end(month_start)
        current = max(month_start, self._parse_day(utc_today()))
        days = []
        while current < month_end:
            if current.weekday() in weekdays:
                days.append(current.isoformat())
            current += timedelta(days=1)
        return days

    def _sync_template(self, cursor, project_id: int, template_id: int, month: str, content: str, weekdays: list[int]) -> None:
        month_end = self._month_end(self._parse_month(month)).isoformat()
        today = utc_today()
        target_days = self._future_template_days(month, weekdays)
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
            if self._is_checked_in(cursor, project_id, day):
                continue
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
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM daily_todos WHERE project_id = %s AND todo_date = %s",
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

    def _editable_template_month(self, month: str) -> None:
        if self._parse_month(month) < self._parse_day(utc_today()).replace(day=1):
            raise ValueError("不能修改过去月份的固定待办")

    def list_fixed_todos(self, project_id: int, month: str) -> list[dict]:
        self._parse_month(month)
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            cursor.execute(
                """
                SELECT id, month_key, content, weekdays, created_at, updated_at
                FROM monthly_fixed_todos WHERE project_id = %s AND month_key = %s ORDER BY id ASC
                """,
                (project_id, month),
            )
            rows = list(cursor.fetchall())
        for row in rows:
            row["weekdays"] = self._weekdays_list(row["weekdays"])
        return rows

    def create_fixed_todo(self, project_id: int, month: str, content: str, weekdays: list[int]) -> list[dict]:
        self._editable_template_month(month)
        weekday_value = self._weekdays_value(weekdays)
        now = utc_now()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            cursor.execute(
                """
                INSERT INTO monthly_fixed_todos (project_id, month_key, content, weekdays, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (project_id, month, content, weekday_value, now, now),
            )
            self._sync_template(cursor, project_id, cursor.lastrowid, month, content, weekdays)
        return self.list_fixed_todos(project_id, month)

    def update_fixed_todo(self, project_id: int, template_id: int, content: str | None, weekdays: list[int] | None) -> dict:
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            cursor.execute(
                "SELECT month_key, content, weekdays FROM monthly_fixed_todos WHERE id = %s AND project_id = %s",
                (template_id, project_id),
            )
            template = cursor.fetchone()
            if not template:
                raise ValueError(f"template_id={template_id} 不存在")
            self._editable_template_month(template["month_key"])
            next_content = content if content is not None else template["content"]
            next_weekdays = weekdays if weekdays is not None else self._weekdays_list(template["weekdays"])
            cursor.execute(
                "UPDATE monthly_fixed_todos SET content = %s, weekdays = %s, updated_at = %s WHERE id = %s",
                (next_content, self._weekdays_value(next_weekdays), utc_now(), template_id),
            )
            self._sync_template(cursor, project_id, template_id, template["month_key"], next_content, next_weekdays)
            return {"month": template["month_key"]}

    def delete_fixed_todo(self, project_id: int, template_id: int) -> dict:
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            cursor.execute(
                "SELECT month_key FROM monthly_fixed_todos WHERE id = %s AND project_id = %s",
                (template_id, project_id),
            )
            template = cursor.fetchone()
            if not template:
                raise ValueError(f"template_id={template_id} 不存在")
            self._editable_template_month(template["month_key"])
            cursor.execute("DELETE FROM monthly_fixed_todos WHERE id = %s", (template_id,))
            cursor.execute(
                """
                DELETE FROM daily_todos
                WHERE project_id = %s AND template_id = %s AND is_customized = FALSE AND todo_date >= %s
                """,
                (project_id, template_id, utc_today()),
            )
            return {"month": template["month_key"]}

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

    def make_up(self, project_id: int, day: str) -> dict:
        selected_day = self._parse_day(day)
        today = self._parse_day(utc_today())
        now = utc_now()
        with get_conn() as conn:
            cursor = conn.cursor()
            self._ensure_project(cursor, project_id)
            if selected_day >= today:
                raise ValueError("补签卡只能用于补签过去的日期")
            if self._is_checked_in(cursor, project_id, day):
                raise ValueError("该日期已签到，无需补签")
            if self._makeup_used(cursor, project_id, selected_day.replace(day=1)) >= self.MAKEUP_CARDS_PER_MONTH:
                raise ValueError(f"本月补签卡已用完（每月 {self.MAKEUP_CARDS_PER_MONTH} 次）")
            cursor.execute(
                """
                INSERT INTO daily_checkins (project_id, checkin_date, completed_at, is_makeup)
                VALUES (%s, %s, %s, TRUE)
                """,
                (project_id, day, now),
            )
            return self._summary(cursor, project_id, day)
