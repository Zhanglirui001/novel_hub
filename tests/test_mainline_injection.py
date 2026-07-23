import unittest

from app.services.writing_agent import WritingAgent


def _base_state(**overrides) -> dict:
    state = {
        "tail_text": "前文正文内容。",
        "instruction": "顺着往下写",
        "mode": "continue",
        "mainline": "",
        "global_mainline": "",
        "directive": {"intent_type": "advance", "beat": "推进", "approx_length": 200},
        "style": {"pov": "third_person", "cadence": "balanced", "top_words": []},
        "picked": {"characters": [], "world_rules": []},
        "context": {"terms": [], "taboos": []},
    }
    state.update(overrides)
    return state


class MainlineInjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = WritingAgent()

    def test_global_and_chapter_mainline_both_injected_into_writer_prompt(self):
        state = _base_state(
            mainline="本章：主角闯入禁地。",
            global_mainline="全书：主角最终推翻旧秩序。",
        )
        system = self.agent._compose_write_messages(state)[0]["content"]
        self.assertIn("全书：主角最终推翻旧秩序。", system)
        self.assertIn("本章：主角闯入禁地。", system)
        # 分层顺序：全书主线在本章主线之前。
        self.assertLess(system.index("全书主线"), system.index("本章主线"))

    def test_global_mainline_absent_when_empty(self):
        state = _base_state(mainline="", global_mainline="")
        system = self.agent._compose_write_messages(state)[0]["content"]
        self.assertNotIn("全书主线", system)
        self.assertNotIn("本章主线", system)

    def test_intent_prompt_includes_global_mainline_line(self):
        state = _base_state(global_mainline="全书大方向。")
        prompt = self.agent._compose_intent_prompt(state)
        self.assertIn("全书主线：全书大方向。", prompt)


if __name__ == "__main__":
    unittest.main()
