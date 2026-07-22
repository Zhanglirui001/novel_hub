import json
import re
from collections import Counter

from app.database import get_conn, utc_now


_STOPWORDS = {
    "的",
    "了",
    "和",
    "是",
    "在",
    "我",
    "你",
    "他",
    "她",
    "它",
    "这",
    "那",
    "就",
    "都",
    "也",
}


class StyleService:
    # 采纳样本滚动窗口大小：只取最近 K 条 accepted 纳入活画像。
    ACCEPTED_WINDOW = 20
    # 采纳样本入池的最小中文字数，低于此值只入库不重算，避免碎样本污染画像。
    MIN_ACCEPTED_CHARS = 12

    def _compute_metrics(self, samples: list[str]) -> dict:
        joined = "\n".join(samples)
        sentences = [s for s in re.split(r"[。！？!?]", joined) if s.strip()]
        avg_sentence_length = round(sum(len(s) for s in sentences) / max(len(sentences), 1), 2)

        chars = [ch for ch in joined if "一" <= ch <= "鿿"]
        words = [c for c in chars if c not in _STOPWORDS]
        top_words = [w for w, _ in Counter(words).most_common(12)]

        first_person_hits = sum(joined.count(p) for p in ["我", "我们", "吾"])
        third_person_hits = sum(joined.count(p) for p in ["他", "她", "他们", "她们"])
        pov = "first_person" if first_person_hits >= third_person_hits else "third_person"

        cadence = "fast" if avg_sentence_length < 24 else "balanced" if avg_sentence_length < 42 else "slow"

        return {
            "avg_sentence_length": avg_sentence_length,
            "top_words": top_words,
            "pov": pov,
            "cadence": cadence,
            "sample_count": len(samples),
        }

    def _persist_samples(self, c, project_id: int, source: str, samples: list[str], now: str) -> None:
        for sample in samples:
            text = sample.strip()
            if not text:
                continue
            c.execute(
                """
                INSERT INTO style_samples (project_id, source, content, created_at)
                VALUES (%s, %s, %s, %s)
                """,
                (project_id, source, text, now),
            )

    def _load_sample_pool(self, c, project_id: int) -> list[str]:
        """活画像样本池：全部 manual 锚点 + 最近 K 条 accepted。

        锚点加权——manual 按需整体重复，使其贡献不被 accepted 淹没（>= accepted 条数），
        避免文风长期漂向模型自身腔调。
        """
        c.execute(
            "SELECT content FROM style_samples WHERE project_id = %s AND source = 'manual' ORDER BY id ASC",
            (project_id,),
        )
        manual = [r["content"] for r in c.fetchall()]

        c.execute(
            """
            SELECT content FROM style_samples
            WHERE project_id = %s AND source = 'accepted'
            ORDER BY id DESC LIMIT %s
            """,
            (project_id, self.ACCEPTED_WINDOW),
        )
        accepted = [r["content"] for r in c.fetchall()]

        if manual and len(manual) < len(accepted):
            factor = -(-len(accepted) // len(manual))  # ceil
            weighted_manual = manual * factor
        else:
            weighted_manual = manual
        return weighted_manual + accepted

    def _insert_profile(self, c, project_id: int, name: str, metrics: dict, now: str) -> None:
        c.execute(
            """
            INSERT INTO style_profiles (project_id, name, metrics_json, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (project_id, name, json.dumps(metrics, ensure_ascii=False), now, now),
        )

    def build_profile(self, project_id: int, name: str, samples: list[str]) -> dict:
        metrics = self._compute_metrics(samples)
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            self._persist_samples(c, project_id, "manual", samples, now)
            self._insert_profile(c, project_id, name, metrics, now)
        return metrics

    def record_accepted_sample(self, project_id: int, text: str) -> dict:
        """作者采纳一段 AI 续写后回流为风格样本，刷新活画像。"""
        text = text.strip()
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            if text:
                self._persist_samples(c, project_id, "accepted", [text], now)

            c.execute(
                "SELECT COUNT(*) AS n FROM style_samples WHERE project_id = %s AND source = 'accepted'",
                (project_id,),
            )
            accepted_count = c.fetchone()["n"]

            zh_chars = sum(1 for ch in text if "一" <= ch <= "鿿")
            if zh_chars < self.MIN_ACCEPTED_CHARS:
                return {"updated": False, "accepted_count": accepted_count}

            pool = self._load_sample_pool(c, project_id)
            metrics = self._compute_metrics(pool)
            metrics["accepted_count"] = accepted_count
            self._insert_profile(c, project_id, "default", metrics, now)

        return {"updated": True, "accepted_count": accepted_count, "metrics": metrics}

    def get_latest_profile(self, project_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT COUNT(*) AS n FROM style_samples WHERE project_id = %s AND source = 'accepted'",
                (project_id,),
            )
            accepted_count = c.fetchone()["n"]

            c.execute(
                """
                SELECT metrics_json FROM style_profiles
                WHERE project_id = %s
                ORDER BY id DESC LIMIT 1
                """,
                (project_id,),
            )
            row = c.fetchone()
            if not row:
                return {
                    "avg_sentence_length": 28,
                    "top_words": [],
                    "pov": "third_person",
                    "cadence": "balanced",
                    "sample_count": 0,
                    "accepted_count": accepted_count,
                }
            metrics = json.loads(row["metrics_json"])
            metrics["accepted_count"] = accepted_count
            return metrics
