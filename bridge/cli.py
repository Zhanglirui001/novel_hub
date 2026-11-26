"""novel_hub 桥接 CLI。

用法：
  python -m bridge status                 # 检查 MySQL/后端/前端可达性
  python -m bridge sync [--force]         # 推送工作区 → novel_hub（幂等）
  python -m bridge pull [--workspace DIR] # novel_hub 采纳后章节 → 工作区手稿/成品
  python -m bridge projects               # 列出 novel_hub 中的项目
  python -m bridge call <METHOD> <PATH> [JSON_BODY]   # 通用调用任意 REST 端点

示例：
  python -m bridge call GET "/projects"
  python -m bridge call POST "/projects/4/inspiration/boards" "{\"title\":\"新画板\"}"
"""
from __future__ import annotations

import argparse
import json

from . import http, sync


def _print_json(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="bridge", description="工作区 ⇄ novel_hub 同步桥")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp_sync = sub.add_parser("sync", help="推送工作区内容到 novel_hub")
    sp_sync.add_argument("--force", action="store_true", help="已存在的章节也重新推送（会产生新版本）")

    sp_pull = sub.add_parser("pull", help="把 novel_hub 章节回流到工作区手稿/成品")
    sp_pull.add_argument("--workspace", default=None, help="工作区根目录（默认自动探测）")

    sub.add_parser("status", help="检查 MySQL/后端/前端可达性")
    sub.add_parser("projects", help="列出 novel_hub 中的项目")

    sp_call = sub.add_parser("call", help="通用调用任意 REST 端点")
    sp_call.add_argument("method", help="HTTP 方法：GET/POST/PUT/PATCH/DELETE")
    sp_call.add_argument("path", help="路径，例如 /projects 或 /projects/4/chapters")
    sp_call.add_argument("body", nargs="?", default=None, help="可选 JSON 请求体（字符串）")

    args = p.parse_args(argv)

    if args.cmd == "status":
        _print_json(sync.status())
    elif args.cmd == "projects":
        _print_json(http.get("/projects") or [])
    elif args.cmd == "sync":
        _print_json(sync.push(force=getattr(args, "force", False)))
    elif args.cmd == "pull":
        _print_json(sync.pull(getattr(args, "workspace", None)))
    elif args.cmd == "call":
        payload = None
        if args.body:
            payload = json.loads(args.body)
        _print_json(http.request(args.method, args.path, payload) or {})


if __name__ == "__main__":
    main()
