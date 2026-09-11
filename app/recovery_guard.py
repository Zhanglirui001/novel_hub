"""Exclude library restores from in-flight writes, including streamed AI tasks."""
import threading
from starlette.responses import JSONResponse


class RecoveryGuard:
    def __init__(self, app):
        self.app = app
        self.lock = threading.Lock()
        self.writers = 0
        self.restoring = False

    async def __call__(self, scope, receive, send):
        # Some existing GET routes lazily create graph rows; include reads too.
        if scope['type'] != 'http' or scope['method'] == 'OPTIONS' or scope['path'] == '/health':
            return await self.app(scope, receive, send)
        restore = scope['path'] == '/recovery/restore'
        with self.lock:
            blocked = self.restoring or (restore and self.writers > 0)
            if not blocked:
                self.writers += 1
                self.restoring = restore
        if blocked:
            response = JSONResponse({'detail': '当前有写入或 AI 任务正在运行，请等待完成后再恢复或保存'}, status_code=409)
            return await response(scope, receive, send)
        try:
            await self.app(scope, receive, send)
        finally:
            with self.lock:
                self.writers -= 1
                if restore:
                    self.restoring = False
