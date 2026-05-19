import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass
class RouteDecision:
    planner_model: str
    writer_model: str
    judge_model: str


class ModelRouter:
    def choose(self, task_type: str, char_count: int, budget: str, target_latency_ms: int) -> RouteDecision:
        writer = "writer-premium"
        if budget == "low" or target_latency_ms <= 3000:
            writer = "writer-fast"
        elif char_count > 2500:
            writer = "writer-context"

        planner = "planner-mini" if target_latency_ms <= 3000 else "planner-standard"
        judge = "judge-strict" if task_type == "polish" else "judge-balanced"
        return RouteDecision(planner_model=planner, writer_model=writer, judge_model=judge)


class HeuristicModelClient:
    is_stub = True

    def generate(self, model_name: str, prompt: str, role: str) -> str:
        if role == "planner":
            return "目标:保持设定一致并完成任务;步骤:读取设定->生成候选->一致性审校->输出补丁"
        if role == "writer":
            return prompt
        if role == "judge":
            return "一致性检查已完成"
        return prompt


class QwenModelClient:
    is_stub = False

    def __init__(self, api_key: str, base_url: str) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def generate(self, model_name: str, prompt: str, role: str) -> str:
        model = self._resolve_model(model_name, role)
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": model,
            "messages": self._build_messages(prompt, role),
            "temperature": 0.7 if role == "writer" else 0.2,
            "max_tokens": 1024 if role == "writer" else 256,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        data = self._post_json(url, headers, payload, timeout_s=60)
        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("Qwen 返回为空: choices 为空")
        message = (choices[0] or {}).get("message") or {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("Qwen 返回为空: message.content 为空")
        return content.strip()

    def _resolve_model(self, model_name: str, role: str) -> str:
        default_model = os.getenv("QWEN_DEFAULT_MODEL", "qwen-plus")
        if role == "planner":
            return os.getenv("QWEN_PLANNER_MODEL", default_model)
        if role == "judge":
            return os.getenv("QWEN_JUDGE_MODEL", default_model)
        if model_name == "writer-fast":
            return os.getenv("QWEN_WRITER_FAST_MODEL", os.getenv("QWEN_WRITER_MODEL", default_model))
        if model_name == "writer-context":
            return os.getenv("QWEN_WRITER_CONTEXT_MODEL", os.getenv("QWEN_WRITER_MODEL", default_model))
        if model_name == "writer-premium":
            return os.getenv("QWEN_WRITER_PREMIUM_MODEL", os.getenv("QWEN_WRITER_MODEL", default_model))
        return os.getenv("QWEN_WRITER_MODEL", default_model)

    def _build_messages(self, prompt: str, role: str) -> list[dict[str, str]]:
        if role == "writer":
            return [
                {"role": "system", "content": "你是小说写作与润色助手，优先遵守设定与术语，输出自然中文正文。"},
                {"role": "user", "content": prompt},
            ]
        return [{"role": "user", "content": prompt}]

    def _post_json(self, url: str, headers: dict[str, str], payload: dict, timeout_s: int) -> dict:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return json.loads(raw)
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            raise RuntimeError(f"Qwen 调用失败: HTTP {exc.code} {raw}".strip()) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Qwen 调用失败: {exc.reason}") from exc


def build_model_client():
    api_key = os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return HeuristicModelClient()
    base_url = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    return QwenModelClient(api_key=api_key, base_url=base_url)

