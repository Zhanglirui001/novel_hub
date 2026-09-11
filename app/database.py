import queue
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime

import pymysql
from pymysql.cursors import DictCursor

import app.config as config


def _is_sqlite() -> bool:
    return config.settings.database_backend == "sqlite"


def _is_duplicate_column_error(exc: Exception) -> bool:
    if _is_sqlite():
        return isinstance(exc, sqlite3.OperationalError) and "duplicate column name" in str(exc).lower()
    return isinstance(exc, pymysql.err.OperationalError) and bool(exc.args) and exc.args[0] == 1060


def _translate_sqlite_sql(sql: str) -> str:
    if sql.lstrip().upper().startswith('CREATE TRIGGER'):
        return sql
    translated = sql.replace("%s", "?")
    translated = re.sub(r"\bINT\s+PRIMARY\s+KEY\s+AUTO_INCREMENT\b", "INTEGER PRIMARY KEY AUTOINCREMENT", translated, flags=re.I)
    translated = re.sub(r"\bMEDIUMTEXT\b", "TEXT", translated, flags=re.I)
    translated = re.sub(r"\bDECIMAL\s*\([^)]*\)", "REAL", translated, flags=re.I)
    translated = re.sub(r"\s+AFTER\s+`?\w+`?", "", translated, flags=re.I)
    translated = re.sub(
        r"ON\s+DUPLICATE\s+KEY\s+UPDATE\s+completed_at\s*=\s*completed_at",
        "ON CONFLICT DO NOTHING",
        translated,
        flags=re.I,
    )
    translated = re.sub(
        r"ON\s+DUPLICATE\s+KEY\s+UPDATE\s+updated_at\s*=\s*VALUES\s*\(updated_at\)",
        "ON CONFLICT DO UPDATE SET updated_at = excluded.updated_at",
        translated,
        flags=re.I,
    )
    translated = re.sub(r"\bINSERT\s+IGNORE\b", "INSERT OR IGNORE", translated, flags=re.I)
    translated = re.sub(r"\s+FOR\s+UPDATE\b", "", translated, flags=re.I)
    translated = re.sub(
        r",\s*UNIQUE\s+KEY\s+`?\w+`?\s*\(([^)]+)\)",
        r", UNIQUE(\1)",
        translated,
        flags=re.I,
    )
    while re.search(r",\s*INDEX\s+`?\w+`?\s*\([^)]*\)", translated, flags=re.I):
        translated = re.sub(r",\s*INDEX\s+`?\w+`?\s*\([^)]*\)", "", translated, count=1, flags=re.I)
    translated = re.sub(r"\)\s*ENGINE\s*=\s*\w+\s+DEFAULT\s+CHARSET\s*=\s*\w+\s*$", ")", translated, flags=re.I | re.S)
    return translated


class _SQLiteCursor:
    def __init__(self, cursor: sqlite3.Cursor):
        self._cursor = cursor

    def execute(self, sql, params=None):
        self._cursor.execute(_translate_sqlite_sql(sql), tuple(params or ()))
        return self

    def executemany(self, sql, params):
        self._cursor.executemany(_translate_sqlite_sql(sql), params)
        return self

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def _dict_row(self, row):
        if row is None:
            return None
        columns = [item[0] for item in self._cursor.description]
        return dict(zip(columns, row))

    def fetchone(self):
        return self._dict_row(self._cursor.fetchone())

    def fetchall(self):
        rows = self._cursor.fetchall()
        if not rows:
            return []
        columns = [item[0] for item in self._cursor.description]
        return [dict(zip(columns, row)) for row in rows]

    def __iter__(self):
        for row in self.fetchall():
            yield row


class _SQLiteConnection:
    def __init__(self, path: str):
        self._connection = sqlite3.connect(path, timeout=30, check_same_thread=False)
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA foreign_keys=ON")
        self._connection.execute("PRAGMA busy_timeout=30000")

    def cursor(self):
        return _SQLiteCursor(self._connection.cursor())

    def commit(self):
        self._connection.commit()

    def rollback(self):
        self._connection.rollback()

    def close(self):
        self._connection.close()

    def ping(self, reconnect=True):
        self._connection.execute("SELECT 1")


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def utc_today() -> str:
    return datetime.utcnow().date().isoformat()


def _base_connect(db: str | None = None):
    if _is_sqlite():
        path = os.path.abspath(config.settings.sqlite_path)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return _SQLiteConnection(path)
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
    if _is_sqlite():
        cursor.execute(f"PRAGMA table_info(`{table}`)")
        return any(row["name"] == column for row in cursor.fetchall())
    cursor.execute(f"SHOW COLUMNS FROM `{table}` LIKE %s", (column,))
    return cursor.fetchone() is not None


def _index_exists(cursor, table: str, index: str) -> bool:
    if _is_sqlite():
        cursor.execute(f"PRAGMA index_list(`{table}`)")
        return any(row["name"] == index for row in cursor.fetchall())
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
    if not _is_sqlite():
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
        if _is_sqlite():
            from app.schema_migrations import apply
            apply(conn)
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
            CREATE TABLE IF NOT EXISTS style_samples (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                source VARCHAR(32) NOT NULL,
                content MEDIUMTEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                INDEX idx_style_sample_project(project_id)
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
            CREATE TABLE IF NOT EXISTS chapter_mainlines (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                chapter_id INT NOT NULL,
                content TEXT NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_mainline_chapter(project_id, chapter_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS project_mainlines (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_global_mainline_project(project_id)
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
            except Exception as exc:
                if not _is_duplicate_column_error(exc):
                    raise
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_checkins (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                checkin_date DATE NOT NULL,
                completed_at VARCHAR(32) NOT NULL,
                is_makeup BOOLEAN NOT NULL DEFAULT FALSE,
                UNIQUE KEY uq_daily_checkins_project_date(project_id, checkin_date),
                INDEX idx_daily_checkins_project_date(project_id, checkin_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        try:
            c.execute("ALTER TABLE daily_checkins ADD COLUMN is_makeup BOOLEAN NOT NULL DEFAULT FALSE")
        except Exception as exc:
            if not _is_duplicate_column_error(exc):
                raise
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
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS storyline_graphs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                viewport_json TEXT NOT NULL,
                version INT NOT NULL DEFAULT 1,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                UNIQUE KEY uq_storyline_graph_project(project_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS storyline_nodes (
                id VARCHAR(64) PRIMARY KEY,
                graph_id INT NOT NULL,
                title VARCHAR(255) NOT NULL DEFAULT '',
                description MEDIUMTEXT NOT NULL,
                position_x DOUBLE NOT NULL DEFAULT 0,
                position_y DOUBLE NOT NULL DEFAULT 0,
                width DOUBLE NULL,
                height DOUBLE NULL,
                z_index INT NOT NULL DEFAULT 0,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_storyline_nodes_graph(graph_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS storyline_edges (
                id VARCHAR(64) PRIMARY KEY,
                graph_id INT NOT NULL,
                source_node_id VARCHAR(64) NOT NULL,
                target_node_id VARCHAR(64) NOT NULL,
                label VARCHAR(255) NOT NULL DEFAULT '',
                style_json TEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_storyline_edges_graph(graph_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_cards (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                card_type VARCHAR(64) NOT NULL,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                color VARCHAR(32) NOT NULL DEFAULT 'amber',
                origin VARCHAR(32) NOT NULL DEFAULT 'manual',
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_cards_project_updated(project_id, updated_at, id),
                INDEX idx_inspiration_cards_project_type(project_id, card_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_boards (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                viewport_json TEXT NOT NULL,
                graph_version INT NOT NULL DEFAULT 1,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_boards_project_updated(project_id, updated_at, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_nodes (
                id VARCHAR(64) PRIMARY KEY,
                board_id INT NOT NULL,
                card_id INT NULL,
                node_type VARCHAR(32) NOT NULL,
                position_x DOUBLE NOT NULL DEFAULT 0,
                position_y DOUBLE NOT NULL DEFAULT 0,
                width DOUBLE NULL,
                height DOUBLE NULL,
                z_index INT NOT NULL DEFAULT 0,
                data_json MEDIUMTEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_nodes_board(board_id),
                INDEX idx_inspiration_nodes_card(card_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_edges (
                id VARCHAR(64) PRIMARY KEY,
                board_id INT NOT NULL,
                source_node_id VARCHAR(64) NOT NULL,
                target_node_id VARCHAR(64) NOT NULL,
                edge_type VARCHAR(32) NOT NULL DEFAULT 'relation',
                label VARCHAR(255) NOT NULL DEFAULT '',
                style_json TEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_edges_board(board_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_chat_sessions (
                board_id INT PRIMARY KEY,
                chat_session_id INT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_board_chat_session(chat_session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_ai_proposals (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                board_id INT NOT NULL,
                assistant_message_id INT NULL,
                base_graph_version INT NOT NULL,
                actions_json MEDIUMTEXT NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'draft',
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_proposals_board_status(board_id, status, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_cards (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                card_type VARCHAR(64) NOT NULL,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                color VARCHAR(32) NOT NULL DEFAULT 'amber',
                origin VARCHAR(32) NOT NULL DEFAULT 'manual',
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_cards_project_updated(project_id, updated_at, id),
                INDEX idx_inspiration_cards_project_type(project_id, card_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_boards (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                viewport_json TEXT NOT NULL,
                graph_version INT NOT NULL DEFAULT 1,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_boards_project_updated(project_id, updated_at, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_nodes (
                id VARCHAR(64) PRIMARY KEY,
                board_id INT NOT NULL,
                card_id INT NULL,
                node_type VARCHAR(32) NOT NULL,
                position_x DOUBLE NOT NULL DEFAULT 0,
                position_y DOUBLE NOT NULL DEFAULT 0,
                width DOUBLE NULL,
                height DOUBLE NULL,
                z_index INT NOT NULL DEFAULT 0,
                data_json MEDIUMTEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_nodes_board(board_id),
                INDEX idx_inspiration_nodes_card(card_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_edges (
                id VARCHAR(64) PRIMARY KEY,
                board_id INT NOT NULL,
                source_node_id VARCHAR(64) NOT NULL,
                target_node_id VARCHAR(64) NOT NULL,
                edge_type VARCHAR(32) NOT NULL DEFAULT 'relation',
                label VARCHAR(255) NOT NULL DEFAULT '',
                style_json TEXT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_edges_board(board_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_chat_sessions (
                board_id INT PRIMARY KEY,
                chat_session_id INT NOT NULL,
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_board_chat_session(chat_session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_ai_proposals (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT NOT NULL,
                board_id INT NOT NULL,
                assistant_message_id INT NULL,
                base_graph_version INT NOT NULL,
                actions_json MEDIUMTEXT NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'draft',
                created_at VARCHAR(32) NOT NULL,
                updated_at VARCHAR(32) NOT NULL,
                INDEX idx_inspiration_proposals_board_status(board_id, status, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
