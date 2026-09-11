import hashlib
import json
import os
import queue
import sqlite3
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import app.config as config
import app.database as db
from app.schema_migrations import CURRENT, MIGRATIONS
from app.services import library_backup as backups, history_service as history, project_archive as projects
from app import recovery_api
from app import schema_migrations


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / 'test.db')
        settings = replace(config.settings, database_backend='sqlite', sqlite_path=self.path)
        self.patches = [patch.object(config, 'settings', settings), patch.object(backups, 'settings', settings),
                        patch.object(recovery_api, 'settings', settings),
                        patch.object(db, '_pool', queue.Queue(maxsize=10)),
                        patch.dict(os.environ, {'BACKUP_DIR': str(Path(self.temp.name) / 'backups')})]
        for p in self.patches:
            p.start()
        db.init_db()
        self.sql("INSERT INTO projects VALUES (1, '测试小说', '中文项目', 'now')")
        self.sql("INSERT INTO chapters VALUES (1,1,'第一章','第一卷','原稿',0,1,'now')")

    def tearDown(self):
        while not db._pool.empty():
            db._pool.get_nowait().close()
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def sql(self, sql, args=()):
        conn = sqlite3.connect(self.path)
        try:
            with conn:
                return conn.execute(sql, args).fetchall()
        finally:
            conn.close()

    def archive(self):
        result = backups.create()
        return backups.path_for(result['name']).read_bytes()

    def test_history_covers_insert_edit_rename_and_rollback(self):
        self.assertEqual(len(history.list_versions(1)), 1)
        self.sql("UPDATE chapters SET content='新稿',version=2 WHERE id=1")
        self.sql("UPDATE chapters SET title='新标题' WHERE id=1")
        self.assertEqual(len(history.list_versions(1)), 3)
        self.sql("UPDATE chapters SET version=3 WHERE id=1")
        self.assertEqual(len(history.list_versions(1)), 3)
        original = history.list_versions(1)[-1]
        restored = history.restore_version(1, original['id'], 3, 'now')
        self.assertEqual(restored['content'], '原稿')
        self.assertEqual(restored['version'], 4)
        self.assertEqual(len(history.list_versions(1)), 4)
        with self.assertRaises(ValueError):
            history.restore_version(1, original['id'], 3, 'now')
        self.assertEqual(self.sql('SELECT content FROM chapters')[0][0], '原稿')

    def test_failed_write_does_not_leave_history(self):
        conn = sqlite3.connect(self.path)
        conn.execute("UPDATE chapters SET content='未提交' WHERE id=1")
        conn.rollback()
        conn.close()
        self.assertEqual(len(history.list_versions(1)), 1)

    def test_all_tables_round_trip_and_keys_stay_local(self):
        self.sql("INSERT INTO chat_sessions VALUES (1,1,'对话','now','now')")
        self.sql("INSERT INTO chat_messages VALUES (1,1,'user','内容','{}','now')")
        self.sql("INSERT INTO storyline_graphs VALUES (1,1,'{}',1,'now','now')")
        self.sql("INSERT INTO storyline_nodes VALUES ('a',1,'节点','内容',0,0,NULL,NULL,0,'now','now')")
        self.sql("INSERT INTO storyline_edges VALUES ('e',1,'a','a','边','{}','now','now')")
        self.sql("INSERT INTO model_settings VALUES (1,'stub','','local-secret','','','','now')")
        raw = self.archive()
        self.assertNotIn(b'local-secret', raw)
        self.assertEqual(backups.preview(raw)['chapters'], 1)
        self.sql("UPDATE chapters SET content='待恢复' WHERE id=1")
        result = backups.restore(raw, backups.decode(raw)['sha256'])
        self.assertEqual(self.sql('SELECT content FROM chapters')[0][0], '原稿')
        safety = backups.decode(backups.path_for(result['safety_backup']).read_bytes())
        self.assertEqual(safety['tables']['chapters'][0]['content'], '待恢复')
        self.assertEqual(self.sql('SELECT api_key FROM model_settings')[0][0], 'local-secret')
        new = backups.decode(self.archive())
        self.assertEqual(new['tables'], backups.decode(raw)['tables'])
        self.sql("UPDATE chapters SET content='恢复后继续编辑' WHERE id=1")
        self.assertEqual(len(history.list_versions(1)), 2)

    def test_corruption_unsupported_version_and_broken_relations_rejected(self):
        raw = self.archive()
        data = json.loads(raw)
        data['tables']['chapters'][0]['content'] = 'tampered'
        with self.assertRaises(ValueError):
            backups.preview(backups.canonical(data))
        data = json.loads(raw)
        data['format_version'] = 99
        with self.assertRaises(ValueError):
            backups.decode(backups.canonical(data))
        data = json.loads(raw)
        data['tables']['chapters'][0]['project_id'] = 999
        del data['sha256']
        data['sha256'] = hashlib.sha256(backups.canonical(data)).hexdigest()
        with self.assertRaises(ValueError):
            backups.restore(backups.canonical(data), data['sha256'])
        self.assertEqual(self.sql('SELECT content FROM chapters')[0][0], '原稿')

    def test_disk_failure_prevents_restore(self):
        raw = self.archive()
        self.sql("UPDATE chapters SET content='最新稿' WHERE id=1")
        with patch.object(backups, 'persist', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                backups.restore(raw, backups.decode(raw)['sha256'])
        self.assertEqual(self.sql('SELECT content FROM chapters')[0][0], '最新稿')

    def test_null_primary_key_cannot_be_remapped_during_restore(self):
        data = json.loads(self.archive())
        data['tables']['projects'][0]['id'] = None
        del data['sha256']
        data['sha256'] = hashlib.sha256(backups.canonical(data)).hexdigest()
        with self.assertRaises(ValueError):
            backups.restore(backups.canonical(data), data['sha256'])
        self.assertEqual(self.sql('SELECT name FROM projects')[0][0], '测试小说')

    def test_legacy_import_preserves_source_and_never_overwrites_target(self):
        from app.services.legacy_import import import_legacy
        target = Path(self.temp.name) / 'tauri' / 'novel_hub.db'
        self.assertTrue(import_legacy(target, Path(self.path)))
        conn = sqlite3.connect(target)
        try:
            self.assertEqual(conn.execute('SELECT content FROM chapters').fetchone()[0], '原稿')
        finally:
            conn.close()
        self.sql("UPDATE chapters SET content='旧应用后续编辑' WHERE id=1")
        self.assertFalse(import_legacy(target, Path(self.path)))
        self.assertEqual(self.sql('SELECT content FROM chapters')[0][0], '旧应用后续编辑')

    def test_restore_transaction_rolls_back_on_late_failure(self):
        raw = self.archive()
        self.sql("UPDATE chapters SET content='最新稿' WHERE id=1")
        with patch.object(history, 'install', side_effect=RuntimeError('late failure')):
            with self.assertRaises(RuntimeError):
                backups.restore(raw, backups.decode(raw)['sha256'])
        self.assertEqual(self.sql('SELECT content FROM chapters')[0][0], '最新稿')
        self.sql("UPDATE chapters SET content='still tracked' WHERE id=1")
        self.assertEqual(len(history.list_versions(1)), 3)

    def test_upgrade_seeds_existing_chapters_once_and_daily_snapshot_once(self):
        self.sql('DROP TRIGGER chapter_history_insert')
        self.sql('DROP TRIGGER chapter_history_update')
        self.sql('DROP TABLE chapter_versions')
        self.sql('DELETE FROM schema_migrations')
        db.init_db()
        db.init_db()
        self.assertEqual(len(history.list_versions(1)), 1)
        self.assertEqual(schema_migrations.current(), CURRENT)
        backups.daily_snapshot()
        backups.daily_snapshot()
        self.assertEqual(len(backups.listing()), 1)
        with self.assertRaises(ValueError):
            backups.path_for('../test.novelhub')

    def test_history_pagination(self):
        for n in range(105):
            self.sql('UPDATE chapters SET content=?,version=version+1 WHERE id=1', (str(n),))
        first = history.list_versions(1)
        second = history.list_versions(1, before=first[-1]['id'])
        self.assertEqual((len(first), len(second)), (100, 6))

    def test_recovery_http_workflow(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.recovery_guard import RecoveryGuard
        app = FastAPI()
        app.include_router(recovery_api.router)
        app.add_middleware(RecoveryGuard)
        with TestClient(app) as client:
            created = client.post('/recovery/backups')
            self.assertEqual(created.status_code, 200)
            raw = client.get('/recovery/backups/' + created.json()['name']).content
            preview = client.post('/recovery/preview', content=raw)
            self.assertEqual(preview.status_code, 200)
            self.sql("UPDATE chapters SET content='HTTP修改', version=2 WHERE id=1")
            restored = client.post('/recovery/restore', params={'sha256': preview.json()['sha256']}, content=raw)
            self.assertEqual(restored.status_code, 200, restored.text)
            versions = client.get('/recovery/chapters/1/versions').json()
            self.assertEqual(len(versions), 1)
            detail = client.get(f"/recovery/chapters/1/versions/{versions[0]['id']}")
            self.assertEqual(detail.json()['content'], '原稿')
            self.assertEqual(client.post('/recovery/preview', content='broken').status_code, 400)
            exported = client.get('/recovery/projects/1/export')
            self.assertEqual(exported.status_code, 200)
            project_preview = client.post('/recovery/projects/preview', content=exported.content)
            self.assertEqual(project_preview.status_code, 200)
            imported = client.post(
                '/recovery/projects/import',
                params={'sha256': project_preview.json()['sha256']},
                content=exported.content,
            )
            self.assertEqual(imported.status_code, 200, imported.text)
            self.assertEqual(len(self.sql('SELECT id FROM projects')), 2)

    def test_schema_migration_records_version_rejects_newer_and_rolls_back_failure(self):
        self.assertEqual(schema_migrations.current(), CURRENT)
        self.sql('INSERT INTO schema_migrations VALUES (99, ?, ?)', ('now', '9.9.9'))
        with self.assertRaises(ValueError):
            db.init_db()
        self.sql('DELETE FROM schema_migrations WHERE version=99')
        self.sql('DROP TRIGGER IF EXISTS chapter_history_insert')
        self.sql('DROP TRIGGER IF EXISTS chapter_history_update')
        self.sql('DROP TABLE chapter_versions')
        self.sql('DELETE FROM schema_migrations')
        def boom(_conn):
            raise RuntimeError('migration failed')
        with patch.dict(MIGRATIONS, {1: boom}):
            with self.assertRaises(RuntimeError):
                db.init_db()
        self.assertEqual(self.sql("SELECT name FROM sqlite_master WHERE name='chapter_versions'"), [])
        self.assertEqual(self.sql('SELECT version FROM schema_migrations'), [])
        db.init_db()
        self.assertEqual(schema_migrations.current(), CURRENT)
        self.assertEqual(len(history.list_versions(1)), 1)

    def test_project_export_import_remaps_ids_and_keeps_existing_library(self):
        self.sql("INSERT INTO projects VALUES (2, '另一部', '', 'now')")
        self.sql("INSERT INTO chapters VALUES (2,2,'别的章','卷','别的正文',0,1,'now')")
        self.sql("INSERT INTO chat_sessions VALUES (1,1,'对话','now','now')")
        self.sql("INSERT INTO chat_messages VALUES (1,1,'user','内容','{}','now')")
        raw = backups.canonical(projects.export_project(1))
        self.assertNotIn("另一部".encode("utf-8"), raw)
        preview = projects.preview(raw)
        self.assertEqual(preview['chapters'], 1)
        result = projects.import_project(raw, preview['sha256'])
        self.assertEqual(result['name'], '测试小说')
        self.assertEqual(len(self.sql('SELECT id FROM projects')), 3)
        self.assertNotEqual(result['project_id'], 1)
        imported = self.sql('SELECT id, content FROM chapters WHERE project_id=?', (result['project_id'],))
        self.assertEqual(imported[0][1], '原稿')
        self.assertEqual(self.sql('SELECT content FROM chapters WHERE id=2')[0][0], '别的正文')
        self.assertEqual(len(history.list_versions(imported[0][0])), 1)
        broken = json.loads(raw)
        broken['tables']['chapters'][0]['project_id'] = 999
        unsigned = {key: value for key, value in broken.items() if key != 'sha256'}
        digest = hashlib.sha256(backups.canonical(unsigned)).hexdigest()
        with self.assertRaises(ValueError):
            projects.import_project(backups.canonical({**unsigned, 'sha256': digest}), digest)
        self.assertEqual(len(self.sql('SELECT id FROM projects')), 3)


class RecoveryGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_restore_refuses_active_stream_and_blocks_writes_until_finished(self):
        import asyncio
        from app.recovery_guard import RecoveryGuard
        entered = asyncio.Event()
        release = asyncio.Event()

        async def app(scope, receive, send):
            entered.set()
            await release.wait()

        guard = RecoveryGuard(app)
        messages = []

        async def send(message):
            messages.append(message)

        async def receive():
            return {'type': 'http.request', 'body': b''}

        def scope(path):
            return {'type': 'http', 'method': 'POST', 'path': path}

        task = asyncio.create_task(guard(scope('/draft/continue/stream'), receive, send))
        await entered.wait()
        await guard(scope('/recovery/restore'), receive, send)
        self.assertEqual(messages[0]['status'], 409)
        release.set()
        await task
        entered.clear(); release.clear(); messages.clear()
        task = asyncio.create_task(guard(scope('/recovery/restore'), receive, send))
        await entered.wait()
        await guard(scope('/chapters'), receive, send)
        self.assertEqual(messages[0]['status'], 409)
        release.set()
        await task
        self.assertEqual(guard.writers, 0)
        self.assertFalse(guard.restoring)
