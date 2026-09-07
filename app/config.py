import os
from dataclasses import dataclass


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _load_dotenv() -> None:
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[len("export ") :].lstrip()
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key or key in os.environ:
                    continue
                os.environ[key] = _strip_quotes(value)
    except OSError:
        return


_load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_backend: str = os.getenv("DATABASE_BACKEND", "sqlite").strip().lower()
    sqlite_path: str = os.getenv(
        "SQLITE_PATH",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "novel_hub.db")),
    )
    mysql_host: str = os.getenv("MYSQL_HOST", "localhost")
    mysql_port: int = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_user: str = os.getenv("MYSQL_USER", "root")
    mysql_password: str = os.getenv("MYSQL_PASSWORD", "Zlr20010722!")
    mysql_database: str = os.getenv("MYSQL_DATABASE", "novel_hub")
    mysql_charset: str = os.getenv("MYSQL_CHARSET", "utf8mb4")


settings = Settings()
