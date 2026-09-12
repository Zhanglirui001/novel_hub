"""Production entry point for the FastAPI desktop sidecar.

The Tauri shell owns this process and injects the per-user data paths. Keeping
this entry point separate from the legacy browser launcher makes the backend a
small, independently testable desktop service.
"""

from __future__ import annotations

import os
import secrets
import tempfile
import traceback
from pathlib import Path

import uvicorn
from starlette.responses import JSONResponse


def _write_crash_log() -> None:
    path = Path(os.getenv("NOVEL_HUB_CRASH_LOG") or tempfile.gettempdir())
    if path.suffix.lower() != ".log":
        path = path / "novelhub-sidecar-crash.log"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(traceback.format_exc(), encoding="utf-8")
    except OSError:
        pass


def main() -> None:
    from app.config import settings
    if os.getenv('NOVEL_HUB_IMPORT_LEGACY') == '1' and os.getenv('LOCALAPPDATA'):
        from app.services.legacy_import import import_legacy
        import_legacy(Path(settings.sqlite_path), Path(os.environ['LOCALAPPDATA']) / 'NovelHub' / 'novel_hub.db')
    from app.api import app
    from app.services.library_backup import daily_snapshot

    if settings.database_backend == "sqlite":
        try:
            daily_snapshot()
        except Exception:
            # Failed backup must not prevent access to manuscripts.
            _write_crash_log()

    expected_token = os.getenv("NOVEL_HUB_TOKEN")
    if expected_token:
        @app.middleware("http")
        async def require_desktop_token(request, call_next):
            supplied = request.headers.get("x-novel-hub-token", "")
            if not secrets.compare_digest(supplied, expected_token):
                return JSONResponse({"detail": "本地客户端会话无效，请重新启动 Novel Hub"}, status_code=401)
            return await call_next(request)

    host = os.getenv("NOVEL_HUB_HOST", "127.0.0.1")
    port = int(os.getenv("NOVEL_HUB_PORT", "17831"))
    packaged = os.getenv("NOVEL_HUB_PACKAGED") == "1"
    uvicorn.run(
        app,
        host=host,
        port=port,
        access_log=not packaged,
        log_level=os.getenv("NOVEL_HUB_LOG_LEVEL", "warning" if packaged else "info"),
        log_config=None if packaged else uvicorn.config.LOGGING_CONFIG,
    )


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        _write_crash_log()
        raise
