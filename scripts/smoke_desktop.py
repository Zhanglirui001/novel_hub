"""Start the actual desktop shell with an isolated profile and verify its child service."""
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
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 17831)) == 0:
            raise RuntimeError('Port 17831 is already in use; refusing to disturb a running application')
    root = Path(__file__).resolve().parents[1] / '.runtime'
    with tempfile.TemporaryDirectory(prefix='desktop-smoke-', dir=root) as directory:
        env = {**os.environ, 'NOVEL_HUB_DATA_DIR': str(Path(directory).resolve())}
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
        proc = subprocess.Popen([str(args.executable.resolve())], env=env, startupinfo=startup)
        try:
            deadline = time.monotonic() + 60
            while True:
                try:
                    with urllib.request.urlopen('http://127.0.0.1:17831/health', timeout=2) as response:
                        health = json.load(response)
                    break
                except OSError:
                    if proc.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError('Desktop did not start its local service')
                    time.sleep(0.25)
            assert health['version'] == '0.3.0'
            assert proc.poll() is None
            assert (Path(directory) / 'novel_hub.db').is_file()
            assert list((Path(directory) / 'backups' / 'library').glob('*-daily-*.novelhub'))
            print(json.dumps({'desktop': str(args.executable), 'health': health, 'isolated_data': True, 'result': 'PASS'}, ensure_ascii=False))
        finally:
            if proc.poll() is None:
                subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], check=False, capture_output=True)
                proc.wait(timeout=15)


if __name__ == '__main__':
    main()
