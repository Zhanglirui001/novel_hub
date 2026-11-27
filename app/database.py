"""SQLite 数据库层（由 MySQL 版迁移而来）。

设计要点：
- 用标准库 sqlite3，单文件、免数据库服务。
- 兼容层：SQL 里的 `%s` 占位符在 `execute()` 时统一翻译成 sqlite3 的 `?`，
  因此 `api.py` 与各 `services/*.py` 的 SQL 无需逐条改动。
- 行对象为 dict（等价 pymysql 的 DictCursor），兼容 row["col"] / row.get(...) / .items() / .values()。
- 一次 `get_conn()` 内所有语句共享一个事务：成功 commit、异常 rollback。
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime

import app.config as config


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def utc_today() -> str:
    return datetime.utcnow().date().isoformat()


def _dict_row(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def _translate(sql: str) -> str:
    """MySQL 风格 %s 占位符 → sqlite3 的 ?。"""
    return sql.replace("%s", "?")


class _Cursor:
    """包裹 sqlite3.Cursor：翻译占位符，并提供 lastrowid / rowcount / 上下文管理。"""

    def __init__(self, cursor: sqlite3.Cursor) -> None:
        self._cursor = cursor

    def execute(self, sql: str, params=None):
        if params is None:
            self._cursor.execute(_translate(sql))
        else:
            self._cursor.execute(_translate(sql), params)
        return self

    def executemany(self, sql: str, seq):
        self._cursor.executemany(_translate(sql), seq)
        return self

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def close(self) -> None:
        self._cursor.close()

    @property
    def lastrowid(self):
        return self._cursor.lastrowid

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    @property
    def description(self):
        return self._cursor.description

    def __enter__(self) -> "_Cursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


class _Connection:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def cursor(self) -> _Cursor:
        return _Cursor(self._conn.cursor())

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()

    def execute(self, sql: str, params=None) -> _Cursor:
        return self.cursor().execute(sql, params)


@contextmanager
def get_conn():
    conn = sqlite3.connect(config.settings.sqlite_path, timeout=30)
    conn.row_factory = _dict_row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield _Connection(conn)
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def _column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row["name"] == column for row in cursor.fetchall())


def _index_exists(cursor, table: str, index: str) -> bool:
    cursor.execute(f"PRAGMA index_list({table})")
    return any(row["name"] == index for row in cursor.fetchall())


def _ensure_chapter_hierarchy(cursor) -> None:
    if not _column_exists(cursor, "chapters", "group_title"):
        cursor.execute("ALTER TABLE chapters ADD COLUMN group_title TEXT NOT NULL DEFAULT '默认卷'")
    sort_added = False
    if not _column_exists(cursor, "chapters", "sort_order"):
        cursor.execute("ALTER TABLE chapters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        sort_added = True

    if sort_added:
        cursor.execute("SELECT id, project_id FROM chapters ORDER BY project_id ASC, id ASC")
        current_project = None
        order = 0
        for row in cursor.fetchall():
            if row["project_id"] != current_project:
                current_project = row["project_id"]
                order = 0
            cursor.execute("UPDATE chapters SET sort_order = ? WHERE id = ?", (order, row["id"]))
            order += 1

    if not _index_exists(cursor, "chapters", "idx_chapters_project_group_order"):
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_chapters_project_group_order ON chapters(project_id, group_title, sort_order, id)"
        )


def init_db() -> None:
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                group_title TEXT NOT NULL DEFAULT '默认卷',
                content TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_chapters_project_title ON chapters(project_id, title)")
        # 章节历史版本：每次覆盖保存前把「被覆盖的那一版」留一份，避免误保存/误清空再也找不回。
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chapter_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter_id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                group_title TEXT NOT NULL,
                content TEXT NOT NULL,
                version INTEGER NOT NULL,
                saved_at TEXT NOT NULL
            )
            """
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_chapter_revisions_chapter ON chapter_revisions(chapter_id, id)"
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS lore_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                item_type TEXT NOT NULL,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                tags TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_lore_project_type ON lore_items(project_id, item_type)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS character_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                profile TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_char_project ON character_cards(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS style_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                metrics_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_style_project ON style_profiles(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS style_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                source TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_style_sample_project ON style_samples(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS consistency_issues (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                chapter_id INTEGER,
                issue_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                meta_json TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_issue_project ON consistency_issues(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS patch_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                chapter_id INTEGER,
                task_type TEXT NOT NULL,
                source_text TEXT NOT NULL,
                result_text TEXT NOT NULL,
                patch_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_patch_project ON patch_sets(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS model_run_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                chapter_id INTEGER,
                task_type TEXT NOT NULL,
                model_role TEXT NOT NULL,
                model_name TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER NOT NULL DEFAULT 0,
                cost_estimate NUMERIC NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                meta_json TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_model_log_project ON model_run_logs(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS timeline_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                event_time TEXT NOT NULL,
                label TEXT NOT NULL,
                description TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chapter_mainlines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                chapter_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'confirmed',
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_mainline_chapter ON chapter_mainlines(project_id, chapter_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS project_mainlines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                summary TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'confirmed',
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_global_mainline_project ON project_mainlines(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                todo_date TEXT NOT NULL,
                content TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                template_id INTEGER,
                is_customized INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_daily_todos_project_date_order ON daily_todos(project_id, todo_date, sort_order, id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS monthly_fixed_todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                month_key TEXT NOT NULL,
                content TEXT NOT NULL,
                weekdays TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_monthly_fixed_todos_project_month ON monthly_fixed_todos(project_id, month_key)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                checkin_date TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                is_makeup INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_checkins_project_date ON daily_checkins(project_id, checkin_date)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_daily_checkins_project_date ON daily_checkins(project_id, checkin_date)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_updated ON chat_sessions(project_id, updated_at, id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                context_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS model_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                base_url TEXT NOT NULL DEFAULT '',
                api_key TEXT NOT NULL DEFAULT '',
                writer_model TEXT NOT NULL DEFAULT '',
                planner_model TEXT NOT NULL DEFAULT '',
                judge_model TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS storyline_graphs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                viewport_json TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_storyline_graph_project ON storyline_graphs(project_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS storyline_nodes (
                id TEXT PRIMARY KEY,
                graph_id INTEGER NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL,
                position_x REAL NOT NULL DEFAULT 0,
                position_y REAL NOT NULL DEFAULT 0,
                width REAL,
                height REAL,
                z_index INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_storyline_nodes_graph ON storyline_nodes(graph_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS storyline_edges (
                id TEXT PRIMARY KEY,
                graph_id INTEGER NOT NULL,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                label TEXT NOT NULL DEFAULT '',
                style_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_storyline_edges_graph ON storyline_edges(graph_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                card_type TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'amber',
                origin TEXT NOT NULL DEFAULT 'manual',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_cards_project_updated ON inspiration_cards(project_id, updated_at, id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_cards_project_type ON inspiration_cards(project_id, card_type)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                viewport_json TEXT NOT NULL,
                graph_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_boards_project_updated ON inspiration_boards(project_id, updated_at, id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_nodes (
                id TEXT PRIMARY KEY,
                board_id INTEGER NOT NULL,
                card_id INTEGER,
                node_type TEXT NOT NULL,
                position_x REAL NOT NULL DEFAULT 0,
                position_y REAL NOT NULL DEFAULT 0,
                width REAL,
                height REAL,
                z_index INTEGER NOT NULL DEFAULT 0,
                data_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_nodes_board ON inspiration_board_nodes(board_id)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_nodes_card ON inspiration_board_nodes(card_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_edges (
                id TEXT PRIMARY KEY,
                board_id INTEGER NOT NULL,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                edge_type TEXT NOT NULL DEFAULT 'relation',
                label TEXT NOT NULL DEFAULT '',
                style_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_edges_board ON inspiration_board_edges(board_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_board_chat_sessions (
                board_id INTEGER PRIMARY KEY,
                chat_session_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_board_chat_session ON inspiration_board_chat_sessions(chat_session_id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS inspiration_ai_proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                board_id INTEGER NOT NULL,
                assistant_message_id INTEGER,
                base_graph_version INTEGER NOT NULL,
                actions_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_inspiration_proposals_board_status ON inspiration_ai_proposals(board_id, status, id)")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS outline_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                parent_id INTEGER,
                kind TEXT NOT NULL DEFAULT 'chapter',
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_outline_project ON outline_nodes(project_id)")
        _ensure_chapter_hierarchy(c)
