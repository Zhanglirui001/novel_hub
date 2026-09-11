"""Portable, checksummed library archives. Restore is atomic and never imports SQL."""
import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.database import utc_now
from app.version import __version__

MAX_BYTES = 128 * 1024 * 1024
TABLES = (
    'projects', 'chapters', 'chapter_versions', 'lore_items', 'character_cards',
    'style_profiles', 'style_samples', 'consistency_issues', 'patch_sets',
    'model_run_logs', 'timeline_events', 'chapter_mainlines', 'project_mainlines',
    'monthly_fixed_todos', 'daily_todos', 'daily_checkins', 'chat_sessions',
    'chat_messages', 'storyline_graphs', 'storyline_nodes', 'storyline_edges',
    'inspiration_cards', 'inspiration_boards', 'inspiration_board_nodes',
    'inspiration_board_edges', 'inspiration_board_chat_sessions', 'inspiration_ai_proposals',
)


def root():
    directory = Path(os.getenv('BACKUP_DIR') or Path(settings.sqlite_path).parent / 'backups') / 'library'
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def connect():
    if settings.database_backend != 'sqlite':
        raise ValueError('书架备份和历史记录需要 SQLite 桌面存储模式')
    conn = sqlite3.connect(settings.sqlite_path, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def archive(conn):
    tables = {table: [dict(row) for row in conn.execute(f'SELECT * FROM "{table}" ORDER BY 1')] for table in TABLES}
    payload = {'format': 'novelhub-library', 'format_version': 1, 'app_version': __version__,
               'created_at': utc_now(), 'tables': tables}
    payload['sha256'] = hashlib.sha256(canonical(payload)).hexdigest()
    return payload


def persist(payload, reason):
    name = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{reason}-{uuid.uuid4().hex[:12]}.novelhub"
    path = root() / name
    raw = canonical(payload)
    if len(raw) > MAX_BYTES:
        raise ValueError('书架超过 128 MB，无法生成此格式的备份')
    temporary = path.with_suffix('.tmp')
    try:
        with temporary.open('xb') as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return name


def create(reason='manual'):
    conn = connect()
    try:
        conn.execute('BEGIN')
        payload = archive(conn)
        name = persist(payload, reason)
        return {'name': name, 'created_at': payload['created_at'], 'projects': len(payload['tables']['projects'])}
    finally:
        conn.close()


def daily_snapshot():
    prefix = datetime.now(timezone.utc).strftime('%Y%m%d')
    if not any(root().glob(f'{prefix}*-daily-*.novelhub')):
        create('daily')


def path_for(name):
    if not name or Path(name).name != name or '/' in name or '\\' in name or not name.endswith('.novelhub'):
        raise ValueError('备份文件名无效')
    path = root() / name
    if path.is_symlink() or not path.is_file():
        raise LookupError('备份不存在')
    return path


def listing():
    return [{'name': p.name, 'size': p.stat().st_size,
             'created_at': datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat()}
            for p in sorted(root().glob('*.novelhub'), reverse=True) if not p.is_symlink()]


def decode(raw):
    if len(raw) > MAX_BYTES:
        raise ValueError('备份不能超过 128 MB')
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get('format') != 'novelhub-library' or data.get('format_version') != 1:
            raise ValueError('不支持的备份格式或版本')
        digest = data.get('sha256')
        unsigned = {key: value for key, value in data.items() if key != 'sha256'}
        if digest != hashlib.sha256(canonical(unsigned)).hexdigest():
            raise ValueError('备份校验失败，文件可能已损坏')
        if not isinstance(data.get('tables'), dict) or set(data['tables']) != set(TABLES):
            raise ValueError('备份缺少必要的数据表')
        if not isinstance(data.get('app_version'), str) or not isinstance(data.get('created_at'), str):
            raise ValueError('备份缺少版本或时间信息')
        datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
        return data
    except (UnicodeError, json.JSONDecodeError, TypeError, RecursionError) as exc:
        raise ValueError('备份文件无法读取') from exc


def validate(conn, payload):
    """Validate against trusted live schema in an isolated DB, including references."""
    staging = sqlite3.connect(':memory:')
    try:
        for table in TABLES:
            schema = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()[0]
            staging.execute(schema)
            column_info = list(staging.execute(f'PRAGMA table_info("{table}")'))
            columns = [r[1] for r in column_info]
            rows = payload['tables'][table]
            if not isinstance(rows, list):
                raise ValueError('备份表格式错误')
            for row in rows:
                if not isinstance(row, dict) or set(row) != set(columns):
                    raise ValueError(f'备份数据结构与此版本不兼容：{table}')
                for col in column_info:
                    value = row[col[1]]
                    if col[5] and (value is None or (col[2].upper() == 'INTEGER' and (type(value) is not int or value <= 0))):
                        raise ValueError(f'备份主键无效：{table}.{col[1]}')
                staging.execute(f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in columns)})', [row[k] for k in columns])
        for table in TABLES:
            columns = {r[1] for r in staging.execute(f'PRAGMA table_info("{table}")')}
            refs = {'project_id': 'projects', 'chapter_id': 'chapters', 'template_id': 'monthly_fixed_todos',
                    'session_id': 'chat_sessions', 'chat_session_id': 'chat_sessions',
                    'graph_id': 'storyline_graphs', 'board_id': 'inspiration_boards',
                    'card_id': 'inspiration_cards', 'assistant_message_id': 'chat_messages'}
            if table.endswith('_edges'):
                nodes = 'storyline_nodes' if table.startswith('storyline') else 'inspiration_board_nodes'
                refs.update(source_node_id=nodes, target_node_id=nodes)
            for col, parent in refs.items():
                if col in columns:
                    # Historical records can outlive deleted chapters/messages/templates.
                    if col in {'chapter_id', 'assistant_message_id', 'template_id'}:
                        continue
                    bad = staging.execute(f'SELECT 1 FROM "{table}" a WHERE a."{col}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "{parent}" b WHERE b.id=a."{col}") LIMIT 1').fetchone()
                    if bad:
                        raise ValueError(f'备份存在断开的数据关联：{table}.{col}')
    except sqlite3.Error as exc:
        raise ValueError(f'备份数据验证失败：{exc}') from exc
    finally:
        staging.close()


def preview(raw):
    payload = decode(raw)
    conn = connect()
    try:
        validate(conn, payload)
    finally:
        conn.close()
    return {'created_at': payload['created_at'], 'app_version': payload['app_version'],
            'projects': len(payload['tables']['projects']), 'chapters': len(payload['tables']['chapters']),
            'versions': len(payload['tables']['chapter_versions']), 'sha256': payload['sha256']}


def restore(raw, expected_sha256):
    payload = decode(raw)
    if payload['sha256'] != expected_sha256:
        raise ValueError('备份已变化，请重新预览')
    conn = connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        validate(conn, payload)
        safety = persist(archive(conn), 'before-restore')
        # DDL and all table writes are in one transaction. Failure rolls everything back.
        conn.execute('DROP TRIGGER IF EXISTS chapter_history_insert')
        conn.execute('DROP TRIGGER IF EXISTS chapter_history_update')
        for table in reversed(TABLES):
            conn.execute(f'DELETE FROM "{table}"')
        for table in TABLES:
            columns = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]
            conn.executemany(f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in columns)})',
                             [[row[k] for k in columns] for row in payload['tables'][table]])
        from app.services.history_service import install
        install(conn)
        conn.commit()
        return {'safety_backup': safety, 'projects': len(payload['tables']['projects'])}
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()
