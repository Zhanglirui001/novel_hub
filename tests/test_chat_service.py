import unittest

from app.database import get_conn, init_db, utc_now
from app.services.chat_service import ChatService


class ChatServiceTests(unittest.TestCase):
    def setUp(self):
        init_db()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM chat_messages")
            c.execute("DELETE FROM chat_sessions")

    def _create_session(self, project_id: int = 1, title: str = "测试会话") -> int:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "INSERT INTO chat_sessions (project_id, title, created_at, updated_at) VALUES (%s, %s, %s, %s)",
                (project_id, title, utc_now(), utc_now()),
            )
            return int(c.lastrowid)

    def _add_message(self, session_id: int, role: str, content: str) -> None:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "INSERT INTO chat_messages (session_id, role, content, context_json, created_at) VALUES (%s, %s, %s, %s, %s)",
                (session_id, role, content, "{}", utc_now()),
            )

    def test_clear_session_keeps_session_but_removes_messages(self):
        service = ChatService()
        session_id = self._create_session()
        self._add_message(session_id, "user", "你好")
        self._add_message(session_id, "assistant", "你好啊")

        result = service.clear_session(session_id)

        self.assertTrue(result["cleared"])
        self.assertEqual([], service.list_messages(session_id))
        self.assertEqual("测试会话", service._ensure_session(session_id)["title"])

    def test_delete_session_removes_session_and_messages(self):
        service = ChatService()
        session_id = self._create_session(project_id=7, title="待删除会话")
        self._add_message(session_id, "user", "删除我")

        result = service.delete_session(session_id)

        self.assertTrue(result["deleted"])
        self.assertEqual([], service.list_sessions(7))
        with self.assertRaises(ValueError):
            service.list_messages(session_id)


if __name__ == "__main__":
    unittest.main()
