import queue
from contextlib import contextmanager
from datetime import datetime

import pymysql
from pymysql.cursors import DictCursor

import app.config as config


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def utc_today() -> str:
    return datetime.utcnow().date().isoformat()


def _base_connect(db: str | None = None):
    return pymysql.connect(
        host=config.settings.mysql_host,
        port=config.settings.mysql_port,
        user=config.settings.mysql_user,
        password=config.settings.mysql_password,
        database=db,
        charset=config.settings.mysql_charset,
        cursorclass=DictCursor,
        autocommit=False,
    )


# 简易连接池:queue.Queue 本身线程安全;空了就临时新建,池满时关掉多余连接。
# 没引入新依赖(不需要 DBUtils),量级足够覆盖单机日更场景。
_POOL_SIZE = 10
_pool: "queue.Queue" = queue.Queue(maxsize=_POOL_SIZE)


def _acquire():
    try:
        conn = _pool.get_nowait()
    except queue.Empty:
        return _base_connect(config.settings.mysql_database)
    try:
        conn.ping(reconnect=True)
        return conn
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return _base_connect(config.settings.mysql_database)


def _release(conn) -> None:
    try:
        _pool.put_nowait(conn)
    except queue.Full:
        try:
            conn.close()
        except Exception:
            pass


@contextmanager
def get_conn():
    conn = _acquire()
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass
        raise
    else:
        _release(conn)


def _column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"SHOW COLUMNS FROM `{table}` LIKE %s", (column,))
    return cursor.fetchone() is not None


def _index_exists(cursor, table: str, index: str) -> bool:
    cursor.execute(f"SHOW INDEX FROM `{table}` WHERE Key_name = %s", (index,))
    return cursor.fetchone() is not None


def _ensure_chapter_hierarchy(cursor) -> None:
    sort_added = False
    if not _column_exists(cursor, "chapters", "group_title"):
        cursor.execute(
            "ALTER TABLE chapters ADD COLUMN group_title VARCHAR(255) NOT NULL DEFAULT '默认卷' AFTER title"
        )
    if not _column_exists(cursor, "chapters", "sort_order"):
        cursor.execute(
            "ALTER TABLE chapters ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER content"
        )
        sort_added = True

    if sort_added:
        cursor.execute("SELECT id, project_id FROM chapters ORDER BY project_id ASC, id ASC")
        rows = cursor.fetchall()
        current_project = None
        order = 0
        for row in rows:
            if row["project_id"] != current_project:
                current_project = row["project_id"]
                order = 0
            cursor.execute(
                "UPDATE chapters SET sort_order = %s WHERE id = %s",
                (order, row["id"]),
            )
            order += 1

    if not _index_exists(cursor, "chapters", "idx_chapters_project_group_order"):
        cursor.execute(
            "CREATE INDEX idx_chapters_project_group_order ON chapters(project_id, group_title, sort_order, id)"
        )


def init_db() -> None:
    bootstrap = _base_connect(None)
    try:
        with bootstrap.cursor() as c:
            c.execute(
                f"CREATE DATABASE IF NOT EXISTS `{config.settings.mysql_database}` CHARACTER SET {config.settings.mysql_charset}"
            )
        bootstrap.commit()
    finally:
        bootstrap.close()

    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chapters (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                group_title VARCHAR(255) NOT NULL DEFAULT '默认卷',
                content MEDIUMTEXT NOT NULL,
                sort_order INT NOT NULL DEFAULT 0,
                version INT NOT NULL DEFAULT 1,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_chapters_project_title(project_id, title),
                INDEX idx_chapters_project_group_order(project_id, group_title, sort_order, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        _ensure_chapter_hierarchy(c)
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS lore_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                item_type VARCHAR(64) NOT NULL,
                name VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                tags TEXT,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_lore_project_type(project_id, item_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS character_cards (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                profile TEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_char_project(project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS style_profiles (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                name VARCHAR(128) NOT NULL,
                metrics_json TEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_style_project(project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS consistency_issues (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                chapter_id INT NULL,
                issue_type VARCHAR(64) NOT NULL,
                severity VARCHAR(32) NOT NULL,
                message TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                meta_json TEXT,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_issue_project(project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS patch_sets (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                chapter_id INT NULL,
                task_type VARCHAR(32) NOT NULL,
                source_text MEDIUMTEXT NOT NULL,
                result_text MEDIUMTEXT NOT NULL,
                patch_json MEDIUMTEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_patch_project(project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS model_run_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                chapter_id INT NULL,
                task_type VARCHAR(32) NOT NULL,
                model_role VARCHAR(32) NOT NULL,
                model_name VARCHAR(64) NOT NULL,
                prompt_tokens INT NOT NULL DEFAULT 0,
                completion_tokens INT NOT NULL DEFAULT 0,
                latency_ms INT NOT NULL DEFAULT 0,
                cost_estimate DECIMAL(12,6) NOT NULL DEFAULT 0,
                status VARCHAR(32) NOT NULL,
                meta_json TEXT,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_model_log_project(project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS timeline_events (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                event_time VARCHAR(32) NOT NULL,
                label VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                source VARCHAR(64) NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_timeline_project(project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_todos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                todo_date DATE NOT NULL,
                content VARCHAR(500) NOT NULL,
                completed BOOLEAN NOT NULL DEFAULT FALSE,
                template_id INT NULL,
                is_customized BOOLEAN NOT NULL DEFAULT FALSE,
                sort_order INT NOT NULL DEFAULT 0,
                created_at VARCHAR(32) NOT NULL,
                completed_at VARCHAR(32) NULL,
                INDEX idx_daily_todos_project_date_order(project_id, todo_date, sort_order, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS monthly_fixed_todos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                month_key CHAR(7) NOT NULL,
                content VARCHAR(500) NOT NULL,
                weekdays VARCHAR(20) NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_monthly_fixed_todos_project_month(project_id, month_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        for statement in (
            "ALTER TABLE daily_todos ADD COLUMN template_id INT NULL",
            "ALTER TABLE daily_todos ADD COLUMN is_customized BOOLEAN NOT NULL DEFAULT FALSE",
        ):
            try:
                c.execute(statement)
            except pymysql.err.OperationalError as exc:
                if exc.args[0] != 1060:
                    raise
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_checkins (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                checkin_date DATE NOT NULL,
                completed_at VARCHAR(32) NOT NULL,
                UNIQUE KEY uq_daily_checkins_project_date(project_id, checkin_date),
                INDEX idx_daily_checkins_project_date(project_id, checkin_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_chat_sessions_project_updated(project_id, updated_at, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT PRIMARY KEY AUTO_INCREMENT,
                session_id INT NOT NULL,
                role VARCHAR(32) NOT NULL,
                content MEDIUMTEXT NOT NULL,
                context_json MEDIUMTEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_chat_messages_session(session_id, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS model_settings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                provider VARCHAR(32) NOT NULL,
                base_url VARCHAR(512) NOT NULL DEFAULT '',
                api_key VARCHAR(512) NOT NULL DEFAULT '',
                writer_model VARCHAR(128) NOT NULL DEFAULT '',
                planner_model VARCHAR(128) NOT NULL DEFAULT '',
                judge_model VARCHAR(128) NOT NULL DEFAULT '',
                updated_at VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
