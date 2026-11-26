"""一次性数据迁移：MySQL(novel_hub) → SQLite(默认 novel_hub/novel_hub.db)。

用法（在 novel_hub 目录下）：
    .venv\\Scripts\\python.exe migrate_mysql_to_sqlite.py

说明：运行时已改用 SQLite；本脚本仅在首次迁移历史数据时运行一次，可重复运行（INSERT OR REPLACE 幂等）。
"""
from __future__ import annotations

import sqlite3
from datetime import date, datetime
from decimal import Decimal

import pymysql
from pymysql.cursors import DictCursor

import app.config as config
from app import database

TABLES = [
    "projects", "chapters", "lore_items", "character_cards", "style_profiles",
    "style_samples", "consistency_issues", "patch_sets", "model_run_logs",
    "timeline_events", "chapter_mainlines", "project_mainlines",
    "daily_todos", "monthly_fixed_todos", "daily_checkins",
    "chat_sessions", "chat_messages", "model_settings",
    "storyline_graphs", "storyline_nodes", "storyline_edges",
    "inspiration_cards", "inspiration_boards", "inspiration_board_nodes",
    "inspiration_board_edges", "inspiration_board_chat_sessions",
    "inspiration_ai_proposals",
]


def _convert(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def main() -> None:
    s = config.settings
    mysql = pymysql.connect(
        host=s.mysql_host,
        port=s.mysql_port,
        user=s.mysql_user,
        password=s.mysql_password,
        database=s.mysql_database,
        charset=s.mysql_charset,
        cursorclass=DictCursor,
    )
    database.init_db()  # 确保 SQLite 表结构存在
    sqlite = sqlite3.connect(s.sqlite_path)
    total = 0
    try:
        with mysql.cursor() as mcur:
            for table in TABLES:
                mcur.execute(f"SELECT * FROM {table}")
                rows = mcur.fetchall()
                if not rows:
                    continue
                cols = [d[0] for d in mcur.description]
                col_list = ",".join(f'"{c}"' for c in cols)
                placeholders = ",".join(["?"] * len(cols))
                for row in rows:
                    values = [_convert(row[c]) for c in cols]
                    sqlite.execute(
                        f'INSERT OR REPLACE INTO "{table}" ({col_list}) VALUES ({placeholders})',
                        values,
                    )
                total += len(rows)
                print(f"  {table}: {len(rows)} rows")
        sqlite.commit()
        print(f"迁移完成，共 {total} 行。SQLite => {s.sqlite_path}")
    finally:
        mysql.close()
        sqlite.close()


if __name__ == "__main__":
    main()
