"""Check all release metadata against app/version.py before packaging."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.version import __version__

versions = {
    'web/package.json': json.loads((ROOT / 'web/package.json').read_text())['version'],
    'web/package-lock.json': json.loads((ROOT / 'web/package-lock.json').read_text())['version'],
    'web/package-lock.json root package': json.loads((ROOT / 'web/package-lock.json').read_text())['packages']['']['version'],
    'web/src-tauri/tauri.conf.json': json.loads((ROOT / 'web/src-tauri/tauri.conf.json').read_text())['version'],
    'web/src-tauri/Cargo.toml': re.search(r'^version = "([^"]+)"', (ROOT / 'web/src-tauri/Cargo.toml').read_text(), re.M)[1],
    'installer/NovelHub.iss': re.search(r'MyAppVersion "([^"]+)"', (ROOT / 'installer/NovelHub.iss').read_text())[1],
}
errors = {name: version for name, version in versions.items() if version != __version__}
if errors:
    sys.exit(f'Expected {__version__}; inconsistent release metadata: {errors}')
print(f'All release metadata matches {__version__}')
