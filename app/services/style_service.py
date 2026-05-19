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
    def build_profile(self, project_id: int, name: str, samples: list[str]) -> dict:
        joined = "\n".join(samples)
        sentences = [s for s in re.split(r"[。！？!?]", joined) if s.strip()]
        avg_sentence_length = round(sum(len(s) for s in sentences) / max(len(sentences), 1), 2)

        chars = [ch for ch in joined if "\u4e00" <= ch <= "\u9fff"]
        words = [c for c in chars if c not in _STOPWORDS]
        top_words = [w for w, _ in Counter(words).most_common(12)]

        first_person_hits = sum(joined.count(p) for p in ["我", "我们", "吾"])
        third_person_hits = sum(joined.count(p) for p in ["他", "她", "他们", "她们"])
        pov = "first_person" if first_person_hits >= third_person_hits else "third_person"

        cadence = "fast" if avg_sentence_length < 24 else "balanced" if avg_sentence_length < 42 else "slow"

        metrics = {
            "avg_sentence_length": avg_sentence_length,
            "top_words": top_words,
            "pov": pov,
            "cadence": cadence,
            "sample_count": len(samples),
        }

        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO style_profiles (project_id, name, metrics_json, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (project_id, name, json.dumps(metrics, ensure_ascii=False), now, now),
            )
        return metrics

    def get_latest_profile(self, project_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
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
                }
            return json.loads(row["metrics_json"])
