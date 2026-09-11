"""Exercise the packaged service against a disposable library, without Python at runtime."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('executable', type=Path)
    args = parser.parse_args()
    executable = args.executable.resolve()
    task_root = Path(__file__).resolve().parents[1] / '.runtime'
    task_root.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='sidecar-smoke-', dir=task_root) as directory:
        data = Path(directory)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = {**os.environ, 'DATABASE_BACKEND': 'sqlite', 'SQLITE_PATH': str(data / 'smoke.db'),
               'BACKUP_DIR': str(data / 'backups'), 'NOVEL_HUB_PORT': str(port), 'NOVEL_HUB_PACKAGED': '1',
               'NOVEL_HUB_HOST': '127.0.0.1', 'NOVEL_HUB_CRASH_LOG': str(data / 'crash.log')}
        proc = subprocess.Popen([str(executable)], env=env, cwd=data, creationflags=subprocess.CREATE_NO_WINDOW)
        base = f'http://127.0.0.1:{port}'

        def call(path, method='GET', payload=None):
            raw = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
            request = urllib.request.Request(base + path, data=raw, method=method, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)

        try:
            deadline = time.monotonic() + 45
            while True:
                try:
                    health = call('/health')
                    break
                except OSError:
                    if proc.poll() is not None or time.monotonic() > deadline:
                        crash = data / 'crash.log'
                        raise RuntimeError(crash.read_text() if crash.exists() else 'Packaged service did not become ready')
                    time.sleep(0.25)
            assert health['status'] == 'ok'
            assert health['version'] == '0.3.0'
            pid = call('/projects', 'POST', {'name': '打包冒烟测试', 'description': '隔离数据'})['project_id']
            first = call('/chapters', 'PUT', {'project_id': pid, 'title': '测试章节', 'content': '原始正文', 'group_title': '测试卷'})
            cid = first['chapter_id']
            call('/chapters', 'PUT', {'project_id': pid, 'chapter_id': cid, 'title': '测试章节', 'content': '修改后的正文', 'group_title': '测试卷'})
            versions = call(f'/recovery/chapters/{cid}/versions')
            assert len(versions) == 2
            backup = call('/recovery/backups', 'POST')
            archive = call('/recovery/backups/' + backup['name'])
            preview = call('/recovery/preview', 'POST', archive)
            assert preview['projects'] == 1 and preview['chapters'] == 1
            current = call(f'/chapters/{cid}')
            restored_chapter = call(f"/recovery/chapters/{cid}/versions/{versions[-1]['id']}/restore", 'POST',
                                    {'expected_version': current['version'], 'expected_updated_at': current['updated_at']})
            assert restored_chapter['content'] == '原始正文'
            restored_library = call('/recovery/restore?sha256=' + preview['sha256'], 'POST', archive)
            assert restored_library['safety_backup']
            assert call(f'/chapters/{cid}')['content'] == '修改后的正文'
            assert len(call(f'/recovery/chapters/{cid}/versions')) == 2
            exported = call(f'/recovery/projects/{pid}/export')
            project_preview = call('/recovery/projects/preview', 'POST', exported)
            imported = call('/recovery/projects/import?sha256=' + project_preview['sha256'], 'POST', exported)
            assert imported['project_id'] != pid
            assert len(call('/projects')) == 2
            assert health.get('schema_version') == 1
            assert len(list((data / 'backups' / 'library').glob('*-daily-*.novelhub'))) == 1
            print(json.dumps({'packaged_service': str(executable), 'health': health, 'result': 'PASS: startup, persistence, history, preview, rollback, full restore, project import, daily snapshot'}, ensure_ascii=False))
        finally:
            if proc.poll() is None:
                subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], check=False, capture_output=True)
                proc.wait(timeout=15)


if __name__ == '__main__':
    main()
