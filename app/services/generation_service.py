from __future__ import annotations

import json
import time

from app.database import get_conn, utc_now
from app.services.consistency_guard import ConsistencyGuard
from app.services.lore_service import LoreService
from app.services.modeling import ModelRouter, build_model_client
from app.services.patch_service import PatchService
from app.services.style_service import StyleService


class GenerationService:
    def __init__(self) -> None:
        self.lore_service = LoreService()
        self.style_service = StyleService()
        self.guard = ConsistencyGuard()
        self.patch_service = PatchService()
        self.router = ModelRouter()

    @property
    def model_client(self):
        # 每次访问都重建，保证 Studio 端改完配置即时生效，不需要重启进程。
        return build_model_client()

    def run(
        self,
        project_id: int,
        task_type: str,
        chapter_title: str,
        input_text: str,
        budget: str = "medium",
        target_latency_ms: int = 6000,
    ) -> dict:
        context = self.lore_service.build_context(project_id)
        style = self.style_service.get_latest_profile(project_id)
        route = self.router.choose(task_type, len(input_text), budget, target_latency_ms)

        planner_prompt = f"任务={task_type};文本长度={len(input_text)};设定条目={len(context['world_rules'])}"
        self._log_model_run(project_id, None, task_type, "planner", route.planner_model, planner_prompt)
        self.model_client.generate(route.planner_model, planner_prompt, role="planner")

        writer_prompt = self._compose_writer_prompt(task_type, input_text, context, style)
        self._log_model_run(project_id, None, task_type, "writer", route.writer_model, writer_prompt)
        writer_raw = self._writer_generate(route.writer_model, writer_prompt, task_type, input_text, context, style)

        first_check = self.guard.check(writer_raw, context)
        final_text = writer_raw
        repaired = False
        if first_check["issues"]:
            final_text = self.guard.repair(writer_raw, first_check["issues"], context)
            second_check = self.guard.check(final_text, context)
            issues = second_check["issues"]
            score = second_check["score"]
            repaired = True
        else:
            issues = first_check["issues"]
            score = first_check["score"]

        judge_prompt = f"score={score};issues={len(issues)}"
        self._log_model_run(project_id, None, task_type, "judge", route.judge_model, judge_prompt)
        self.model_client.generate(route.judge_model, judge_prompt, role="judge")

        patch_items = self.patch_service.create_patch(input_text, final_text)
        patch_set_id = self._save_patch_set(project_id, None, task_type, input_text, final_text, patch_items)
        self._save_issues(project_id, None, issues)

        return {
            "task_type": task_type,
            "chapter_title": chapter_title,
            "result_text": final_text,
            "repaired": repaired,
            "consistency_score": score,
            "issues": issues,
            "patch_set_id": patch_set_id,
            "patch_items": patch_items,
            "model_route": {
                "planner": route.planner_model,
                "writer": route.writer_model,
                "judge": route.judge_model,
            },
        }

    def apply_patch_set(self, patch_set_id: int, accepted_ids: list[int], chapter_title: str) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM patch_sets WHERE id = %s", (patch_set_id,))
            row = c.fetchone()
            if not row:
                raise ValueError(f"patch_set_id={patch_set_id} 不存在")
            project_id = row["project_id"]
            source = row["source_text"]
            patch = json.loads(row["patch_json"])
            applied_text = self.patch_service.apply_patch(source, patch, accepted_ids)

            c.execute(
                "SELECT id, version FROM chapters WHERE project_id = %s AND title = %s ORDER BY id DESC LIMIT 1",
                (project_id, chapter_title),
            )
            old = c.fetchone()
            now = utc_now()
            if old:
                c.execute(
                    "UPDATE chapters SET content = %s, version = %s, updated_at = %s WHERE id = %s",
                    (applied_text, old["version"] + 1, now, old["id"]),
                )
                chapter_id = old["id"]
                version = old["version"] + 1
            else:
                c.execute(
                    "INSERT INTO chapters (project_id, title, content, version, updated_at) VALUES (%s, %s, %s, %s, %s)",
                    (project_id, chapter_title, applied_text, 1, now),
                )
                chapter_id = c.lastrowid
                version = 1

            c.execute(
                """
                INSERT INTO timeline_events (project_id, event_time, label, description, source, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    project_id,
                    now,
                    "章节更新",
                    f"{chapter_title} 已更新到 v{version}",
                    "patch_apply",
                    now,
                ),
            )

        return {
            "project_id": project_id,
            "chapter_id": chapter_id,
            "version": version,
            "applied_text": applied_text,
        }

    def _compose_writer_prompt(self, task_type: str, input_text: str, context: dict, style: dict) -> str:
        world = "; ".join(i["name"] for i in context.get("world_rules", [])[:5])
        terms = "; ".join(i["name"] for i in context.get("terms", [])[:8])
        return (
            f"task={task_type}\n"
            f"style={json.dumps(style, ensure_ascii=False)}\n"
            f"world={world}\n"
            f"terms={terms}\n"
            f"text={input_text}"
        )

    def _writer_generate(
        self,
        model_name: str,
        writer_prompt: str,
        task_type: str,
        input_text: str,
        context: dict,
        style: dict,
    ) -> str:
        if not getattr(self.model_client, "is_stub", False):
            return self.model_client.generate(model_name, writer_prompt, role="writer")

        hot_words = "、".join(style.get("top_words", [])[:4])
        required_terms = [t["name"] for t in context.get("terms", []) if "required" in t.get("tags", [])]

        if task_type == "continue":
            bridge = "\n\n"
            addition = "剧情顺着既有冲突推进，人物行动与既有人设保持一致。"
            if hot_words:
                addition += f"语言保持原作者常用词感：{hot_words}。"
            if required_terms:
                addition += "关键术语已纳入叙述：" + "、".join(required_terms[:3]) + "。"
            return input_text.rstrip() + bridge + addition

        polished = input_text
        polished = polished.replace("然后", "随即")
        polished = polished.replace("非常", "颇为")
        polished = polished.replace("  ", " ")
        polished = polished.strip()
        if hot_words:
            polished += f"\n\n（润色保持原有词汇气质：{hot_words}）"
        return polished

    def _save_patch_set(
        self,
        project_id: int,
        chapter_id: int | None,
        task_type: str,
        source_text: str,
        result_text: str,
        patch_items: list[dict],
    ) -> int:
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO patch_sets (project_id, chapter_id, task_type, source_text, result_text, patch_json, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    project_id,
                    chapter_id,
                    task_type,
                    source_text,
                    result_text,
                    json.dumps(patch_items, ensure_ascii=False),
                    now,
                ),
            )
            return c.lastrowid

    def _save_issues(self, project_id: int, chapter_id: int | None, issues: list[dict]) -> None:
        if not issues:
            return
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            for issue in issues:
                c.execute(
                    """
                    INSERT INTO consistency_issues
                    (project_id, chapter_id, issue_type, severity, message, suggestion, meta_json, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        project_id,
                        chapter_id,
                        issue["issue_type"],
                        issue["severity"],
                        issue["message"],
                        issue["suggestion"],
                        "{}",
                        now,
                    ),
                )

    def _log_model_run(
        self,
        project_id: int,
        chapter_id: int | None,
        task_type: str,
        role: str,
        model_name: str,
        prompt: str,
    ) -> None:
        now = utc_now()
        prompt_tokens = max(1, len(prompt) // 4)
        completion_tokens = 80 if role == "writer" else 30
        latency_ms = 120 if role == "planner" else 430 if role == "writer" else 180
        cost_estimate = round((prompt_tokens + completion_tokens) * 0.0000015, 6)

        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO model_run_logs
                (project_id, chapter_id, task_type, model_role, model_name, prompt_tokens, completion_tokens, latency_ms, cost_estimate, status, meta_json, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    project_id,
                    chapter_id,
                    task_type,
                    role,
                    model_name,
                    prompt_tokens,
                    completion_tokens,
                    latency_ms,
                    cost_estimate,
                    "ok",
                    "{}",
                    now,
                ),
            )
        time.sleep(0.01)
