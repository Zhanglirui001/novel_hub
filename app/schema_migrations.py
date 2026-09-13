"""Numbered SQLite schema versions. Failed migrations roll back with the startup transaction."""
from app.database import utc_now
from app.version import __version__

CURRENT = 4


def _version(cursor) -> int:
    row = cursor.execute("SELECT MAX(version) AS v FROM schema_migrations").fetchone()
    return int(row["v"] or 0) if row else 0


def current() -> int:
    from app.database import get_conn
    with get_conn() as conn:
        return _version(conn.cursor())


def apply(conn) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, app_version TEXT NOT NULL)"""
    )
    applied = _version(cursor)
    if applied > CURRENT:
        raise ValueError(f"数据库架构版本 {applied} 高于当前应用支持的 {CURRENT}，请升级应用后再打开此书架")
    for version in range(applied + 1, CURRENT + 1):
        MIGRATIONS[version](conn)
        cursor.execute(
            "INSERT INTO schema_migrations (version, applied_at, app_version) VALUES (%s, %s, %s)",
            (version, utc_now(), __version__),
        )


def migrate_v1(conn) -> None:
    from app.services.history_service import install
    install(conn)


def migrate_v2(conn) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS project_lifecycle (
            project_id INTEGER PRIMARY KEY, archived_at TEXT)"""
    )


def migrate_v3(conn) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS free_notes (
            id INT PRIMARY KEY AUTO_INCREMENT,
            project_id INT NOT NULL,
            note_type VARCHAR(32) NOT NULL DEFAULT 'note',
            title VARCHAR(255) NOT NULL,
            content MEDIUMTEXT NOT NULL,
            tags_json TEXT NOT NULL,
            created_at VARCHAR(32) NOT NULL,
            updated_at VARCHAR(32) NOT NULL,
            INDEX idx_free_notes_project_updated(project_id, updated_at, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""
    )
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS prompt_templates (
            id INT PRIMARY KEY AUTO_INCREMENT,
            project_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            content MEDIUMTEXT NOT NULL,
            applies_to VARCHAR(32) NOT NULL DEFAULT 'all',
            tags_json TEXT NOT NULL,
            is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
            use_count INT NOT NULL DEFAULT 0,
            last_used_at VARCHAR(32) NULL,
            created_at VARCHAR(32) NOT NULL,
            updated_at VARCHAR(32) NOT NULL,
            INDEX idx_prompt_templates_project_updated(project_id, updated_at, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""
    )


def migrate_v4(conn) -> None:
    cursor = conn.cursor()
    for statement in (
        "ALTER TABLE free_notes ADD COLUMN note_type VARCHAR(32) NOT NULL DEFAULT 'note'",
        "ALTER TABLE prompt_templates ADD COLUMN applies_to VARCHAR(32) NOT NULL DEFAULT 'all'",
        "ALTER TABLE prompt_templates ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE",
    ):
        try:
            cursor.execute(statement)
        except Exception as exc:
            if "duplicate column name" not in str(exc).lower():
                raise
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_free_notes_project_type ON free_notes(project_id, note_type, updated_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompt_templates_project_usage ON prompt_templates(project_id, applies_to, is_pinned, last_used_at)")


MIGRATIONS = {1: migrate_v1, 2: migrate_v2, 3: migrate_v3, 4: migrate_v4}
