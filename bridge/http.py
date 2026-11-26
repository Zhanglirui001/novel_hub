"""novel_hub REST 客户端（stdlib，零第三方依赖）。"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"


class HttpError(RuntimeError):
    pass


def request(method: str, path: str, payload=None, base: str = DEFAULT_BASE) -> object:
    url = base.rstrip("/") + path
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", "replace")
            return json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise HttpError(f"HTTP {exc.code} {method} {path} -> {detail}") from exc
    except urllib.error.URLError as exc:
        raise HttpError(
            f"无法连接 novel_hub 后端（{base}）。请先唤起：运行 scripts/start_novel_hub.ps1（原因：{exc.reason}）"
        ) from exc


def get(path: str, base: str = DEFAULT_BASE):
    return request("GET", path, base=base)


def post(path: str, payload, base: str = DEFAULT_BASE):
    return request("POST", path, payload, base=base)


def put(path: str, payload, base: str = DEFAULT_BASE):
    return request("PUT", path, payload, base=base)


def patch(path: str, payload, base: str = DEFAULT_BASE):
    return request("PATCH", path, payload, base=base)


def delete(path: str, base: str = DEFAULT_BASE):
    return request("DELETE", path, base=base)


def request_raw(method: str, path: str, payload=None, base: str = DEFAULT_BASE, timeout: int = 300) -> str:
    """原始请求：返回响应体文本（用于 SSE 流式接口的缓冲读取）。"""
    url = base.rstrip("/") + path
    data = None
    headers = {"Accept": "text/event-stream"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise HttpError(f"HTTP {exc.code} {method} {path} -> {detail}") from exc
    except urllib.error.URLError as exc:
        raise HttpError(f"无法连接 novel_hub 后端（{base}）。原因：{exc.reason}") from exc
