import json
from pathlib import Path


def test_tauri_connect_src_allows_dynamic_local_port():
    config_path = Path(__file__).resolve().parents[1] / 'web' / 'src-tauri' / 'tauri.conf.json'
    config = json.loads(config_path.read_text(encoding='utf-8'))
    csp = config['app']['security']['csp']

    assert 'http://127.0.0.1:17831' not in csp
    assert 'http://127.0.0.1:*' in csp
