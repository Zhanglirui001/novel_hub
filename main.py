import json

import streamlit as st

from app.database import get_conn, init_db
from app.services import ConsistencyGuard, GenerationService, LoreService, StyleService

init_db()

lore_service = LoreService()
style_service = StyleService()
generation_service = GenerationService()
guard = ConsistencyGuard()


def _list_projects() -> list[dict]:
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, description, created_at FROM projects ORDER BY id DESC")
        return list(c.fetchall())


def _project_selector() -> int | None:
    projects = _list_projects()
    if not projects:
        st.info("请先在【项目管理】创建作品。")
        return None
    labels = {f"{p['id']} - {p['name']}": p["id"] for p in projects}
    chosen = st.selectbox("选择项目", list(labels.keys()))
    return labels[chosen]


def page_project() -> None:
    st.subheader("项目管理")
    with st.form("create_project"):
        name = st.text_input("作品名")
        desc = st.text_area("简介")
        ok = st.form_submit_button("创建项目")
    if ok and name.strip():
        from app.database import utc_now

        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "INSERT INTO projects (name, description, created_at) VALUES (%s, %s, %s)",
                (name.strip(), desc.strip(), utc_now()),
            )
        st.success("项目已创建")

    st.markdown("### 项目列表")
    st.dataframe(_list_projects(), use_container_width=True)


def page_lore() -> None:
    st.subheader("设定导入")
    project_id = _project_selector()
    if not project_id:
        return

    st.caption("按 JSON 数组输入，示例：[{'name':'主角','profile':'冷静'}]")
    chars_raw = st.text_area("角色 cards(JSON)", value="[]", height=120)
    rules_raw = st.text_area("世界规则(JSON)", value="[]", height=120)
    terms_raw = st.text_area("术语表(JSON)", value='[{"name":"灵脉","content":"修炼体系核心","tags":["required"]}]', height=120)
    taboos_raw = st.text_area("禁忌规则(JSON)", value="[]", height=100)
    timeline_raw = st.text_area("时间线事件(JSON)", value="[]", height=100)

    if st.button("导入设定"):
        try:
            payload = {
                "project_id": project_id,
                "characters": json.loads(chars_raw),
                "world_rules": json.loads(rules_raw),
                "terms": json.loads(terms_raw),
                "taboos": json.loads(taboos_raw),
                "timeline_events": json.loads(timeline_raw),
            }
            result = lore_service.import_lore(payload)
            st.success(f"导入成功，共 {result['imported_count']} 项")
        except json.JSONDecodeError as exc:
            st.error(f"JSON 解析失败: {exc}")


def page_style() -> None:
    st.subheader("文风画像")
    project_id = _project_selector()
    if not project_id:
        return

    samples = st.text_area("输入作者历史文本（用\\n---\\n分隔多段）", height=240)
    if st.button("生成文风画像"):
        items = [s.strip() for s in samples.split("\\n---\\n") if s.strip()]
        if not items:
            st.warning("至少输入一段样本文本")
            return
        metrics = style_service.build_profile(project_id, "default", items)
        st.success("文风画像已更新")
        st.json(metrics)

    st.markdown("### 当前画像")
    st.json(style_service.get_latest_profile(project_id))


def page_draft(task_type: str) -> None:
    title = "正文续写" if task_type == "continue" else "文本润色"
    st.subheader(title)
    project_id = _project_selector()
    if not project_id:
        return

    chapter_title = st.text_input("章节标题", value="第1章")
    text = st.text_area("输入正文", height=280)
    budget = st.selectbox("预算策略", ["low", "medium", "high"], index=1)
    target_latency_ms = st.slider("目标延迟(ms)", min_value=1000, max_value=10000, value=6000, step=500)

    if st.button("生成建议"):
        if not text.strip():
            st.warning("请输入正文")
            return
        result = generation_service.run(
            project_id=project_id,
            task_type=task_type,
            chapter_title=chapter_title,
            input_text=text,
            budget=budget,
            target_latency_ms=target_latency_ms,
        )
        st.session_state["last_result"] = result
        st.success("生成完成")

    result = st.session_state.get("last_result")
    if not result:
        return

    st.markdown("### 一致性评分")
    st.metric("Score", result["consistency_score"])
    st.caption(f"路由: {result['model_route']}")

    st.markdown("### AI 建议文本")
    st.text_area("result", value=result["result_text"], height=260, label_visibility="collapsed")

    st.markdown("### 冲突报告")
    st.dataframe(result["issues"], use_container_width=True)

    patch_items = result["patch_items"]
    choices = [f"#{p['id']} {p['op']}" for p in patch_items]
    selected_labels = st.multiselect("选择要应用的补丁", choices, default=choices)
    accepted_ids = [int(label.split()[0].replace("#", "")) for label in selected_labels]

    if st.button("应用补丁并保存章节"):
        apply_result = generation_service.apply_patch_set(
            patch_set_id=result["patch_set_id"],
            accepted_ids=accepted_ids,
            chapter_title=chapter_title,
        )
        st.success(f"已保存章节 v{apply_result['version']}")
        st.text_area("应用后文本", value=apply_result["applied_text"], height=220)


def page_consistency() -> None:
    st.subheader("一致性检测")
    project_id = _project_selector()
    if not project_id:
        return

    text = st.text_area("待检查文本", height=240)
    if st.button("执行检测"):
        context = lore_service.build_context(project_id)
        result = guard.check(text, context)
        st.metric("Score", result["score"])
        st.dataframe(result["issues"], use_container_width=True)


def page_timeline() -> None:
    st.subheader("时间线与变更")
    project_id = _project_selector()
    if not project_id:
        return
    st.dataframe(lore_service.list_timeline(project_id), use_container_width=True)


def main() -> None:
    st.set_page_config(page_title="Novel Hub", page_icon="📝", layout="wide")
    st.title("📝 Novel Hub - 小说编辑与润色助手")

    menu = st.sidebar.radio(
        "菜单",
        [
            "项目管理",
            "设定导入",
            "文风画像",
            "正文续写",
            "文本润色",
            "一致性检测",
            "时间线",
        ],
    )

    if menu == "项目管理":
        page_project()
    elif menu == "设定导入":
        page_lore()
    elif menu == "文风画像":
        page_style()
    elif menu == "正文续写":
        page_draft("continue")
    elif menu == "文本润色":
        page_draft("polish")
    elif menu == "一致性检测":
        page_consistency()
    elif menu == "时间线":
        page_timeline()


if __name__ == "__main__":
    main()
