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


if __name__ == "__main__":
    unittest.main()
