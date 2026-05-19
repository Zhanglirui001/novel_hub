import unittest

from app.services.consistency_guard import ConsistencyGuard
from app.services.modeling import ModelRouter
from app.services.patch_service import PatchService


class CoreServiceTests(unittest.TestCase):
    def test_consistency_taboo_detection(self):
        guard = ConsistencyGuard()
        context = {
            "taboos": [{"name": "时光倒流", "content": "禁术"}],
            "terms": [],
            "characters": [],
        }
        result = guard.check("他尝试时光倒流拯救同伴。", context)
        self.assertGreater(len(result["issues"]), 0)
        self.assertLess(result["score"], 100)

    def test_patch_apply_partial(self):
        patch_service = PatchService()
        src = "A\nB\nC"
        dst = "A\nB2\nC\nD"
        patch = patch_service.create_patch(src, dst)
        only_first = [patch[0]["id"]] if patch else []
        out = patch_service.apply_patch(src, patch, only_first)
        self.assertIn("B2", out)

    def test_model_router(self):
        router = ModelRouter()
        route = router.choose(task_type="polish", char_count=3200, budget="medium", target_latency_ms=5000)
        self.assertEqual(route.writer_model, "writer-context")
        self.assertEqual(route.judge_model, "judge-strict")


if __name__ == "__main__":
    unittest.main()
