from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from app.services import library_backup as backups, history_service as history, project_archive as projects
from app.config import settings
import logging
import sqlite3

router = APIRouter(prefix='/recovery', tags=['backup-and-history'])


def run(fn, *args):
    if settings.database_backend != 'sqlite':
        raise HTTPException(409, '此功能需要 SQLite 桌面存储模式')
    try:
        return fn(*args)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except (OSError, sqlite3.Error) as exc:
        logging.getLogger(__name__).exception('Recovery operation failed')
        raise HTTPException(503, '无法完成备份或恢复，请检查磁盘空间、文件权限或数据库是否被占用。现有数据未被替换。') from exc


@router.get('/backups')
def list_backups():
    return run(backups.listing)


@router.post('/backups')
def create_backup():
    return run(backups.create)


@router.get('/backups/{name}')
def download_backup(name: str):
    path = run(backups.path_for, name)
    return Response(path.read_bytes(), media_type='application/json', headers={'Content-Disposition': f'attachment; filename="{name}"'})


async def body(request):
    parts = bytearray()
    async for chunk in request.stream():
        if len(parts) + len(chunk) > backups.MAX_BYTES:
            raise HTTPException(413, '备份不能超过 128 MB')
        parts.extend(chunk)
    return bytes(parts)


@router.post('/preview')
async def preview(request: Request):
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(run, backups.preview, await body(request))


@router.post('/restore')
async def restore(request: Request, sha256: str):
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(run, backups.restore, await body(request), sha256)


@router.get('/chapters/{chapter_id}/versions')
def versions(chapter_id: int, before: int | None = None):
    return run(history.list_versions, chapter_id, 100, before)


@router.get('/chapters/{chapter_id}/versions/{version_id}')
def version(chapter_id: int, version_id: int):
    return run(history.get_version, chapter_id, version_id)


class RestoreVersion(BaseModel):
    expected_version: int
    expected_updated_at: str


@router.post('/chapters/{chapter_id}/versions/{version_id}/restore')
def restore_version(chapter_id: int, version_id: int, payload: RestoreVersion):
    return run(history.restore_version, chapter_id, version_id, payload.expected_version, payload.expected_updated_at)


@router.get('/projects/{project_id}/export')
def export_project(project_id: int):
    payload = run(projects.export_project, project_id)
    return Response(
        backups.canonical(payload),
        media_type='application/json',
        headers={'Content-Disposition': f'attachment; filename="project-{project_id}.novelhub-project"'},
    )


@router.post('/projects/preview')
async def preview_project(request: Request):
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(run, projects.preview, await body(request))


@router.post('/projects/import')
async def import_project(request: Request, sha256: str):
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(run, projects.import_project, await body(request), sha256)
