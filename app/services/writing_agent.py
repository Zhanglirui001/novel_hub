"""续写 Agent —— 基于 LangGraph 的状态图。

流程：intent（理解意图）→ retrieve（取材）→ write（流式落笔）→ guard（守护）
       →[有问题且未修订]→ repair → guard → reader_lens（读者视角品鉴）→ done

与既有 GenerationService 不同，这里 planner/judge 的产出是**真实参与决策**的：
intent 节点产出结构化 WritingDirective 指导 write，guard 触发有界修订循环，
reader_lens 给出一句读者反应。所有阶段通过 LangGraph 的 custom stream 实时外发，
在正文光标处以「幽灵文本」流式预览。

离线（HeuristicModelClient，is_stub=True）时每个节点都有启发式兜底，不依赖真实模型。
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterator, Optional

from typing_extensions import TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from app.database import get_conn, utc_now
from app.services.consistency_guard import ConsistencyGuard
from app.services.lore_service import LoreService
from app.services.modeling import ModelRouter, build_model_client
from app.services.style_service import StyleService


# 意图关键词 → 结构化意图类型；顺序敏感（先命中先赢）。
_INTENT_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("伏笔", "回收", "呼应", "照应"), "payoff"),
    (("对话", "对白", "台词", "说话"), "dialogue"),
    (("环境", "景", "铺陈", "描写", "氛围"), "scenery"),
    (("冲突", "打斗", "对峙", "争执", "反转"), "conflict"),
    (("放慢", "放缓", "舒缓", "留白", "沉淀"), "slow"),
    (("推进", "剧情", "往下", "继续", "发展"), "advance"),
]

_INTENT_LABEL = {
    "payoff": "回收伏笔",
    "dialogue": "对话推进",
    "scenery": "环境铺陈",
    "conflict": "制造冲突",
    "slow": "放慢节奏",
    "advance": "推进剧情",
    "free": "自由续写",
}


class WritingState(TypedDict, total=False):
    project_id: int
    tail_text: str
    instruction: str
    directive: dict
    context: dict
    style: dict
    picked: dict
    writer_model: str
    judge_model: str
    planner_model: str
    draft: str
    issues: list
    score: int
    revisions: int
    reader_reaction: str
    error: str


def _emit(event: dict) -> None:
    """向 custom stream 发一个事件；无 stream 上下文时安静降级为 no-op。"""
    try:
        writer = get_stream_writer()
    except Exception:
        writer = None
    if writer is not None:
        writer(event)


def _extract_json(text: str) -> Optional[dict]:
    """从模型输出里抠出第一段 JSON 对象。"""
    if not text:
        return None
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


class WritingAgent:
    def __init__(self) -> None:
        self.lore_service = LoreService()
        self.style_service = StyleService()
        self.guard = ConsistencyGuard()
        self.router = ModelRouter()
        self._graph = self._build_graph()

    # ---- 对外入口 ----------------------------------------------------------

    def stream_continue(
        self,
        project_id: int,
        tail_text: str,
        instruction: str = "",
        directive: Optional[dict] = None,
        budget: str = "medium",
        target_latency_ms: int = 6000,
    ) -> Iterator[dict]:
        """驱动图并逐事件产出。事件形态：

        - {"type":"stage","key":"intent|retrieve|guard|repair|reader", ...}
        - {"type":"delta","text": <token 片段>}
        - {"type":"done","directive":..,"result_text":..,"consistency_score":..,
                          "issues":[..],"reader_reaction":..}
        - {"type":"error","message":..}
        """
        try:
            context = self.lore_service.build_context(project_id)
            style = self.style_service.get_latest_profile(project_id)
            route = self.router.choose("continue", len(tail_text), budget, target_latency_ms)
        except Exception as exc:  # DB / 设定读取失败也要以 error 帧收尾，不抛 500
            yield {"type": "error", "message": f"读取设定失败：{exc}"}
            return

        state: WritingState = {
            "project_id": project_id,
            "tail_text": tail_text or "",
            "instruction": (instruction or "").strip(),
            "directive": directive or {},
            "context": context,
            "style": style,
            "writer_model": route.writer_model,
            "judge_model": route.judge_model,
            "planner_model": route.planner_model,
            "draft": "",
            "issues": [],
            "score": 100,
            "revisions": 0,
            "reader_reaction": "",
        }

        final: WritingState = dict(state)  # 兜底
        try:
            for mode, chunk in self._graph.stream(state, stream_mode=["custom", "values"]):
                if mode == "custom":
                    yield chunk
                elif mode == "values":
                    final = chunk
        except Exception as exc:
            yield {"type": "error", "message": f"续写失败：{exc}"}
            return

        if final.get("error"):
            yield {"type": "error", "message": final["error"]}
            return

        result_text = (final.get("draft") or "").strip()
        if not result_text:
            yield {"type": "error", "message": "模型返回为空"}
            return

        self._log_run(project_id, "writer", final.get("writer_model", ""), tail_text)
        yield {
            "type": "done",
            "directive": final.get("directive", {}),
            "result_text": result_text,
            "consistency_score": final.get("score", 100),
            "issues": final.get("issues", []),
            "reader_reaction": final.get("reader_reaction", ""),
        }

    # ---- 图定义 ------------------------------------------------------------

    def _build_graph(self):
        g = StateGraph(WritingState)
        g.add_node("intent", self._node_intent)
        g.add_node("retrieve", self._node_retrieve)
        g.add_node("write", self._node_write)
        g.add_node("guard", self._node_guard)
        g.add_node("repair", self._node_repair)
        g.add_node("reader_lens", self._node_reader_lens)

        g.add_edge(START, "intent")
        g.add_edge("intent", "retrieve")
        g.add_edge("retrieve", "write")
        g.add_edge("write", "guard")
        g.add_conditional_edges(
            "guard",
            self._route_after_guard,
            {"repair": "repair", "reader": "reader_lens"},
        )
        g.add_edge("repair", "guard")
        g.add_edge("reader_lens", END)
        return g.compile()

    # ---- 节点 --------------------------------------------------------------

    def _node_intent(self, state: WritingState) -> dict:
        # 微调/换版会带着上一次的 directive 复用，跳过重新解析。
        if state.get("directive"):
            _emit({"type": "stage", "key": "intent", "directive": state["directive"], "reused": True})
            return {}

        directive = self._build_directive(state)
        _emit({"type": "stage", "key": "intent", "directive": directive})
        return {"directive": directive}

    def _node_retrieve(self, state: WritingState) -> dict:
        picked = self._pick_context(state)
        _emit({"type": "stage", "key": "retrieve", "picked": picked})
        return {"picked": picked}

    def _node_write(self, state: WritingState) -> dict:
        client = build_model_client()
        if getattr(client, "is_stub", False):
            text = self._heuristic_write(state)
            _emit({"type": "delta", "text": text})
            return {"draft": text}

        messages = self._compose_write_messages(state)
        pieces: list[str] = []
        try:
            for piece in client.stream_chat(messages):
                if not piece:
                    continue
                pieces.append(piece)
                _emit({"type": "delta", "text": piece})
        except Exception as exc:
            return {"error": f"写手模型调用失败：{exc}"}
        draft = "".join(pieces).strip()
        if not draft:
            # 流式空返回时退回启发式，保证有内容可预览。
            draft = self._heuristic_write(state)
            _emit({"type": "delta", "text": draft})
        return {"draft": draft}

    def _node_guard(self, state: WritingState) -> dict:
        if state.get("error"):
            return {}
        check = self.guard.check(state.get("draft", ""), state.get("context", {}))
        _emit({
            "type": "stage",
            "key": "guard",
            "score": check["score"],
            "issues": check["issues"],
        })
        return {"issues": check["issues"], "score": check["score"]}

    def _node_repair(self, state: WritingState) -> dict:
        _emit({"type": "stage", "key": "repair", "revision": state.get("revisions", 0) + 1})
        client = build_model_client()
        if getattr(client, "is_stub", False):
            repaired = self.guard.repair(state.get("draft", ""), state.get("issues", []), state.get("context", {}))
            _emit({"type": "delta", "text": "", "replace": repaired})
            return {"draft": repaired, "revisions": state.get("revisions", 0) + 1}

        messages = self._compose_repair_messages(state)
        try:
            repaired = client.chat(messages).strip()
        except Exception:
            repaired = self.guard.repair(state.get("draft", ""), state.get("issues", []), state.get("context", {}))
        repaired = repaired or state.get("draft", "")
        _emit({"type": "delta", "text": "", "replace": repaired})
        return {"draft": repaired, "revisions": state.get("revisions", 0) + 1}

    def _node_reader_lens(self, state: WritingState) -> dict:
        reaction = self._reader_reaction(state)
        _emit({"type": "stage", "key": "reader", "reaction": reaction})
        return {"reader_reaction": reaction}

    # ---- 条件边 ------------------------------------------------------------

    @staticmethod
    def _route_after_guard(state: WritingState) -> str:
        if state.get("error"):
            return "reader"
        if state.get("issues") and state.get("revisions", 0) < 1:
            return "repair"
        return "reader"

    # ---- 意图解析 ----------------------------------------------------------

    def _build_directive(self, state: WritingState) -> dict:
        client = build_model_client()
        if not getattr(client, "is_stub", False):
            self._log_run(state["project_id"], "planner", state.get("planner_model", ""), state.get("instruction", ""))
            prompt = self._compose_intent_prompt(state)
            try:
                raw = client.generate(state.get("planner_model", "planner-standard"), prompt, role="planner")
                data = _extract_json(raw)
            except Exception:
                data = None
            if data:
                return self._normalize_directive(data, state)
        return self._heuristic_directive(state)

    def _heuristic_directive(self, state: WritingState) -> dict:
        instruction = state.get("instruction", "")
        intent_type = "free"
        for keywords, key in _INTENT_KEYWORDS:
            if any(k in instruction for k in keywords):
                intent_type = key
                break

        context = state.get("context", {})
        must_include = [
            t["name"]
            for t in context.get("terms", [])
            if t.get("name") and "required" in (t.get("tags") or [])
        ][:4]
        must_avoid = [t["name"] for t in context.get("taboos", []) if t.get("name")][:5]
        open_threads = self._open_threads(context)

        style = state.get("style", {})
        cadence = style.get("cadence", "balanced")
        approx = {"fast": 180, "balanced": 260, "slow": 360}.get(cadence, 260)

        return {
            "intent_type": intent_type,
            "beat": instruction or _INTENT_LABEL.get(intent_type, "自由续写"),
            "emotion": "顺承前文情绪",
            "pov_lock": style.get("pov", "third_person"),
            "approx_length": approx,
            "must_include": must_include,
            "must_avoid": must_avoid,
            "open_threads": open_threads,
        }

    def _normalize_directive(self, data: dict, state: WritingState) -> dict:
        base = self._heuristic_directive(state)
        out = dict(base)
        for key in ("intent_type", "beat", "emotion", "pov_lock"):
            if isinstance(data.get(key), str) and data[key].strip():
                out[key] = data[key].strip()
        if isinstance(data.get("approx_length"), (int, float)):
            out["approx_length"] = int(data["approx_length"])
        for key in ("must_include", "must_avoid", "open_threads"):
            val = data.get(key)
            if isinstance(val, list):
                merged = list(dict.fromkeys([*out.get(key, []), *[str(x) for x in val if str(x).strip()]]))
                out[key] = merged[:6]
        if out.get("intent_type") not in _INTENT_LABEL:
            out["intent_type"] = base["intent_type"]
        return out

    @staticmethod
    def _open_threads(context: dict) -> list[str]:
        threads: list[str] = []
        for event in context.get("timeline", [])[-6:]:
            label = (event.get("label") or "").strip()
            if label and label not in ("章节更新",):
                threads.append(label)
        return list(dict.fromkeys(threads))[:5]

    # ---- 取材 --------------------------------------------------------------

    def _pick_context(self, state: WritingState) -> dict:
        context = state.get("context", {})
        directive = state.get("directive", {})
        haystack = (state.get("tail_text", "") + state.get("instruction", ""))

        characters = [
            c["name"]
            for c in context.get("characters", [])
            if c.get("name") and c["name"] in haystack
        ]
        if not characters:
            characters = [c["name"] for c in context.get("characters", [])[:3] if c.get("name")]

        def rank(items: list[dict], limit: int) -> list[str]:
            named = [i for i in items if i.get("name")]
            hit = [i["name"] for i in named if i["name"] in haystack]
            rest = [i["name"] for i in named if i["name"] not in haystack]
            return list(dict.fromkeys([*hit, *rest]))[:limit]

        return {
            "characters": characters[:4],
            "world_rules": rank(context.get("world_rules", []), 4),
            "terms": rank(context.get("terms", []), 6),
            "taboos": [t["name"] for t in context.get("taboos", []) if t.get("name")][:5],
            "open_threads": directive.get("open_threads", []),
        }

    # ---- Prompt 组装 -------------------------------------------------------

    def _compose_intent_prompt(self, state: WritingState) -> str:
        context = state.get("context", {})
        terms = "、".join(t["name"] for t in context.get("terms", [])[:8] if t.get("name"))
        taboos = "、".join(t["name"] for t in context.get("taboos", [])[:5] if t.get("name"))
        threads = "、".join(self._open_threads(context)) or "（无）"
        tail = state.get("tail_text", "")[-600:]
        return (
            "你是小说责编，请把作者对下文的要求解析为结构化写作指令，只输出 JSON，不要解释。\n"
            "字段：intent_type(advance/dialogue/scenery/conflict/slow/payoff/free)、"
            "beat(本段要达成的目标，一句话)、emotion(情绪基调)、pov_lock(视角)、"
            "approx_length(建议字数,整数)、must_include(数组)、must_avoid(数组)、open_threads(数组)。\n\n"
            f"作者要求：{state.get('instruction', '') or '（未指定，顺着往下写）'}\n"
            f"术语表：{terms or '（无）'}\n"
            f"禁忌：{taboos or '（无）'}\n"
            f"可回收线索：{threads}\n"
            f"前文结尾：{tail}"
        )

    def _compose_write_messages(self, state: WritingState) -> list[dict[str, str]]:
        directive = state.get("directive", {})
        style = state.get("style", {})
        picked = state.get("picked", {})

        system = (
            "你是资深网文写手。请紧接前文续写下一段正文，只输出正文本身，"
            "不要输出解释、标题或引号。严格遵守设定与禁忌，保持作者文风与视角。\n"
            f"写作意图：{_INTENT_LABEL.get(directive.get('intent_type', 'free'), '自由续写')}\n"
            f"本段目标：{directive.get('beat', '顺承前文推进')}\n"
            f"情绪基调：{directive.get('emotion', '顺承前文')}\n"
            f"视角：{directive.get('pov_lock', style.get('pov', 'third_person'))}；"
            f"节奏：{style.get('cadence', 'balanced')}；建议字数：约 {directive.get('approx_length', 260)} 字\n"
            f"文风常用词：{('、'.join(style.get('top_words', [])[:6]) or '（无）')}\n"
            f"在场角色：{('、'.join(picked.get('characters', [])) or '（未指定）')}\n"
            f"相关设定：{('、'.join(picked.get('world_rules', [])) or '（无）')}\n"
            f"必须体现术语：{('、'.join(directive.get('must_include', [])) or '（无）')}\n"
            f"必须避免：{('、'.join(directive.get('must_avoid', [])) or '（无）')}\n"
            f"可回收伏笔：{('、'.join(directive.get('open_threads', [])) or '（无）')}"
        )
        user = f"前文：\n{state.get('tail_text', '')[-1600:]}\n\n请续写下一段。"
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

    def _compose_repair_messages(self, state: WritingState) -> list[dict[str, str]]:
        issues = state.get("issues", [])
        issue_lines = "；".join(f"{i['message']}→{i['suggestion']}" for i in issues[:5])
        system = (
            "你是小说校对。请在保持原文剧情、文风与视角不变的前提下，"
            "修正下列一致性问题，只输出修改后的完整正文，不要解释。\n"
            f"待修问题：{issue_lines}"
        )
        user = f"原文：\n{state.get('draft', '')}"
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

    # ---- 启发式兜底 --------------------------------------------------------

    def _heuristic_write(self, state: WritingState) -> str:
        directive = state.get("directive", {})
        style = state.get("style", {})
        tail = state.get("tail_text", "").rstrip()
        hot = "、".join(style.get("top_words", [])[:4])
        must = directive.get("must_include", [])
        label = _INTENT_LABEL.get(directive.get("intent_type", "free"), "自由续写")

        pieces = [f"（离线预览·{label}）", directive.get("beat", "剧情顺着既有冲突继续推进，人物行动与人设保持一致。")]
        if must:
            pieces.append("关键术语已纳入：" + "、".join(must[:3]) + "。")
        if hot:
            pieces.append(f"语言贴近作者常用词：{hot}。")
        addition = "".join(pieces)
        return (tail + "\n\n" + addition) if tail else addition

    def _reader_reaction(self, state: WritingState) -> str:
        client = build_model_client()
        draft = state.get("draft", "")
        if not getattr(client, "is_stub", False):
            self._log_run(state["project_id"], "judge", state.get("judge_model", ""), draft[:400])
            prompt = (
                "你是挑剔的读者。读完下面这段续写，用一句不超过30字的中文说出你的真实感受"
                "（是否想追读、张力与代入感如何、有无出戏），只输出这句话。\n\n" + draft[:800]
            )
            try:
                out = client.generate(state.get("judge_model", "judge-balanced"), prompt, role="judge").strip()
                if out:
                    return out.splitlines()[0][:40]
            except Exception:
                pass
        return self._heuristic_reaction(draft)

    @staticmethod
    def _heuristic_reaction(draft: str) -> str:
        if not draft:
            return "内容偏空，读者难以入戏"
        has_dialogue = any(p in draft for p in ["“", "”", "「", "」", "：\"", ":", "——"])
        hook = draft.rstrip().endswith(("？", "！", "…", "?", "!"))
        if len(draft) < 80:
            return "篇幅偏短，铺垫不足，读者代入感弱"
        if hook and has_dialogue:
            return "张力与悬念在线，读者有追读欲"
        if has_dialogue:
            return "对话推进自然，结尾可再留一点钩子"
        return "画面感尚可，缺一处让读者停不下来的悬念"

    # ---- 日志 --------------------------------------------------------------

    def _log_run(self, project_id: int, role: str, model_name: str, prompt: str) -> None:
        now = utc_now()
        prompt_tokens = max(1, len(prompt) // 4)
        completion_tokens = 120 if role == "writer" else 40
        latency_ms = 480 if role == "writer" else 160
        cost_estimate = round((prompt_tokens + completion_tokens) * 0.0000015, 6)
        try:
            with get_conn() as conn:
                c = conn.cursor()
                c.execute(
                    """
                    INSERT INTO model_run_logs
                    (project_id, chapter_id, task_type, model_role, model_name,
                     prompt_tokens, completion_tokens, latency_ms, cost_estimate, status, meta_json, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        project_id, None, "continue_stream", role, model_name or role,
                        prompt_tokens, completion_tokens, latency_ms, cost_estimate,
                        "ok", "{}", now,
                    ),
                )
        except Exception:
            # 日志失败不应影响续写主流程。
            pass
