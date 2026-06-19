from __future__ import annotations

from app.database import get_conn, utc_now
from app.services.modeling import QwenModelClient


SUPPORTED_PROVIDERS = ("qwen", "openai-compatible", "stub")
DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


def _row_to_dict(row: dict | None) -> dict:
    if not row:
        return {
            "provider": "stub",
            "base_url": "",
            "api_key": "",
            "writer_model": "",
            "planner_model": "",
            "judge_model": "",
            "updated_at": "",
        }
    return {
        "provider": row["provider"],
        "base_url": row["base_url"],
        "api_key": row["api_key"],
        "writer_model": row["writer_model"],
        "planner_model": row["planner_model"],
        "judge_model": row["judge_model"],
        "updated_at": row["updated_at"],
    }


def _mask(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 6:
        return "***"
    return f"{api_key[:3]}***{api_key[-4:]}"


def get_settings_raw() -> dict:
    """读取持久化的原始配置（含明文 API Key），仅供后端内部使用。"""
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM model_settings ORDER BY id DESC LIMIT 1")
        return _row_to_dict(c.fetchone())


def get_settings_public() -> dict:
    """对外返回的配置：API Key 掩码处理。"""
    raw = get_settings_raw()
    raw["api_key_masked"] = _mask(raw["api_key"])
    raw["api_key_set"] = bool(raw["api_key"])
    raw.pop("api_key", None)
    return raw


def save_settings(payload: dict) -> dict:
    """保存配置；api_key 为空字符串表示保留原值，None 或非空字符串则覆盖。"""
    provider = payload.get("provider") or "stub"
    if provider not in SUPPORTED_PROVIDERS:
        raise ValueError(f"不支持的 provider={provider}")

    current = get_settings_raw()
    next_api_key = payload.get("api_key")
    api_key = current["api_key"] if next_api_key in (None, "") else next_api_key

    record = {
        "provider": provider,
        "base_url": payload.get("base_url") or "",
        "api_key": api_key,
        "writer_model": payload.get("writer_model") or "",
        "planner_model": payload.get("planner_model") or "",
        "judge_model": payload.get("judge_model") or "",
        "updated_at": utc_now(),
    }
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM model_settings")
        c.execute(
            """
            INSERT INTO model_settings
                (provider, base_url, api_key, writer_model, planner_model, judge_model, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                record["provider"],
                record["base_url"],
                record["api_key"],
                record["writer_model"],
                record["planner_model"],
                record["judge_model"],
                record["updated_at"],
            ),
        )
    return get_settings_public()


def test_connection(payload: dict) -> dict:
    """测试连通性：传入的 api_key 为空时复用 DB 中保存的值。"""
    provider = payload.get("provider") or "stub"
    base_url = (payload.get("base_url") or "").strip() or DEFAULT_BASE_URL
    model = (payload.get("writer_model") or "").strip() or "qwen-plus"

    api_key = payload.get("api_key") or ""
    if not api_key:
        api_key = get_settings_raw()["api_key"]

    if provider == "stub":
        return {"ok": True, "provider": provider, "message": "stub 模式不调用外部 API"}
    if not api_key:
        return {"ok": False, "provider": provider, "message": "未提供 API Key"}

    client = QwenModelClient(api_key=api_key, base_url=base_url)
    try:
        reply = client.generate(model, "ping", role="judge")
        snippet = reply[:60]
        return {"ok": True, "provider": provider, "message": f"连接成功: {snippet}"}
    except Exception as exc:  # 上游 RuntimeError / 网络异常都收敛为 message 返回
        return {"ok": False, "provider": provider, "message": str(exc)}
