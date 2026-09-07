from __future__ import annotations

import argparse
import ctypes
import json
import logging
import os
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path


APP_NAME = "Novel Hub"
FRONTEND_URL = "http://127.0.0.1:3001"
BACKEND_URL = "http://127.0.0.1:8000"
MUTEX_NAME = "Local\\NovelHubDesktopLauncher"
ERROR_ALREADY_EXISTS = 183


def app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def data_root() -> Path:
    base = Path(os.getenv("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    root = base / "NovelHub"
    root.mkdir(parents=True, exist_ok=True)
    return root


def configure_environment() -> None:
    root = data_root()
    os.environ["DATABASE_BACKEND"] = "sqlite"
    os.environ["SQLITE_PATH"] = str(root / "novel_hub.db")
    os.environ["BACKUP_DIR"] = str(root / "backups")
    os.environ.setdefault("CORS_ORIGINS", "http://localhost:3001,http://127.0.0.1:3001")


def configure_logging() -> None:
    log_dir = data_root() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=log_dir / "launcher.log",
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        encoding="utf-8",
    )


def show_error(message: str) -> None:
    logging.exception(message)
    ctypes.windll.user32.MessageBoxW(None, message, APP_NAME, 0x10)


def is_ready(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return 200 <= response.status < 500
    except Exception:
        return False


def wait_until_ready(frontend_process: subprocess.Popen, timeout: int = 60) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if frontend_process.poll() is not None:
            raise RuntimeError(f"The web service exited with code {frontend_process.returncode}.")
        if is_ready(f"{BACKEND_URL}/docs") and is_ready(FRONTEND_URL):
            return
        time.sleep(0.5)
    raise RuntimeError("Novel Hub did not become ready within 60 seconds.")


def write_state() -> None:
    state = {"pid": os.getpid(), "executable": str(Path(sys.executable).resolve()), "started_at": time.time()}
    (data_root() / "desktop-process.json").write_text(json.dumps(state), encoding="utf-8")


def remove_state() -> None:
    try:
        (data_root() / "desktop-process.json").unlink(missing_ok=True)
    except OSError:
        pass


def stop_running_instance() -> int:
    state_path = data_root() / "desktop-process.json"
    if not state_path.exists():
        ctypes.windll.user32.MessageBoxW(None, "Novel Hub is not running.", APP_NAME, 0x40)
        return 0
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        pid = int(state["pid"])
        result = subprocess.run(
            ["taskkill.exe", "/PID", str(pid), "/T", "/F"],
            creationflags=subprocess.CREATE_NO_WINDOW,
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError("Windows could not stop the recorded process.")
        state_path.unlink(missing_ok=True)
        return 0
    except Exception as exc:
        ctypes.windll.user32.MessageBoxW(None, f"Could not stop Novel Hub:\n{exc}", APP_NAME, 0x10)
        return 1


def acquire_mutex():
    handle = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not handle:
        raise OSError("Could not create the application mutex.")
    already_running = ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS
    return handle, already_running


def run() -> int:
    configure_environment()
    configure_logging()
    mutex, already_running = acquire_mutex()
    if already_running:
        ctypes.windll.kernel32.CloseHandle(mutex)
        webbrowser.open(FRONTEND_URL)
        return 0

    root = app_root()
    node_exe = root / "runtime" / "node.exe"
    server_js = root / "web" / "server.js"
    if not node_exe.exists() or not server_js.exists():
        raise FileNotFoundError("The embedded web runtime is incomplete. Please reinstall Novel Hub.")

    configure_environment()
    from app.api import app
    import uvicorn

    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="info",
            access_log=False,
            log_config=None,
        )
    )
    backend_thread = threading.Thread(target=server.run, name="novel-hub-api", daemon=True)
    backend_thread.start()

    web_env = os.environ.copy()
    web_env.update({"PORT": "3001", "HOSTNAME": "127.0.0.1", "NODE_ENV": "production"})
    log_dir = data_root() / "logs"
    stdout_log = open(log_dir / "web.stdout.log", "a", encoding="utf-8")
    stderr_log = open(log_dir / "web.stderr.log", "a", encoding="utf-8")
    frontend_process = subprocess.Popen(
        [str(node_exe), str(server_js)],
        cwd=server_js.parent,
        env=web_env,
        stdout=stdout_log,
        stderr=stderr_log,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    try:
        wait_until_ready(frontend_process)
        write_state()
        webbrowser.open(FRONTEND_URL)
        while frontend_process.poll() is None and backend_thread.is_alive():
            time.sleep(1)
        if frontend_process.poll() is not None:
            raise RuntimeError(f"The web service stopped unexpectedly ({frontend_process.returncode}).")
        raise RuntimeError("The API service stopped unexpectedly.")
    finally:
        remove_state()
        server.should_exit = True
        if frontend_process.poll() is None:
            frontend_process.terminate()
            try:
                frontend_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                frontend_process.kill()
        stdout_log.close()
        stderr_log.close()
        ctypes.windll.kernel32.CloseHandle(mutex)


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--stop", action="store_true")
    args, _ = parser.parse_known_args()
    if args.stop:
        return stop_running_instance()
    try:
        return run()
    except Exception as exc:
        show_error(f"Novel Hub failed to start:\n{exc}\n\nLogs: {data_root() / 'logs'}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
