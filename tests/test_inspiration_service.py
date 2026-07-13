import unittest
from unittest.mock import patch

from app.services.inspiration_service import GraphConflictError, InspirationService


class InspirationServiceTests(unittest.TestCase):
    def setUp(self):
        self.service = InspirationService()

    def test_clean_tags_deduplicates_and_limits_entries(self):
        tags = self.service._clean_tags(["剧情", "", "剧情", "人物"])
        self.assertEqual(tags, ["剧情", "人物"])

    def test_validate_proposal_actions_rejects_unknown_action(self):
        with self.assertRaises(ValueError):
            self.service._validate_proposal_actions([{"action_type": "delete_card"}])

    def test_validate_proposal_actions_requires_card_payload(self):
        with self.assertRaises(ValueError):
            self.service._validate_proposal_actions([{"action_type": "create_card"}])

    def test_graph_patch_rejects_stale_version_before_writing(self):
        class Cursor:
            def execute(self, _sql, _params=None):
                return None

            def fetchone(self):
                return {
                    "id": 1,
                    "project_id": 1,
                    "title": "主线",
                    "description": "",
                    "viewport_json": '{"x": 0, "y": 0, "zoom": 1}',
                    "graph_version": 4,
                    "created_at": "",
                    "updated_at": "",
                }

        class Connection:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def cursor(self):
                return Cursor()

        with patch("app.services.inspiration_service.get_conn", return_value=Connection()):
            with self.assertRaises(GraphConflictError):
                self.service.patch_graph(1, 1, {
                    "expected_graph_version": 3,
                    "viewport": {"x": 0, "y": 0, "zoom": 1},
                    "nodes": [],
                    "edges": [],
                    "deleted_node_ids": [],
                    "deleted_edge_ids": [],
                })
    def test_validate_node_accepts_lightweight_nodes_without_card(self):
        class Cursor:
            def execute(self, _sql, _params=None):
                return None

            def fetchone(self):
                return None

        for node_type in ("annotation", "event", "character"):
            self.service._validate_node(Cursor(), 1, 1, {"id": f"{node_type}-1", "node_type": node_type, "card_id": None})

    def test_validate_node_rejects_card_id_for_lightweight_node(self):
        class Cursor:
            def execute(self, _sql, _params=None):
                return None

        with self.assertRaises(ValueError):
            self.service._validate_node(Cursor(), 1, 1, {"id": "event-1", "node_type": "event", "card_id": 1})
    def test_validate_node_accepts_lightweight_nodes_without_card(self):
        class Cursor:
            def execute(self, _sql, _params=None):
                return None

            def fetchone(self):
                return None

        for node_type in ("annotation", "event", "character"):
            self.service._validate_node(Cursor(), 1, 1, {"id": f"{node_type}-1", "node_type": node_type, "card_id": None})

    def test_validate_node_rejects_card_id_for_lightweight_node(self):
        class Cursor:
            def execute(self, _sql, _params=None):
                return None

        with self.assertRaises(ValueError):
            self.service._validate_node(Cursor(), 1, 1, {"id": "event-1", "node_type": "event", "card_id": 1})


if __name__ == "__main__":
    unittest.main()
