from __future__ import annotations

from difflib import SequenceMatcher


class PatchService:
    def create_patch(self, source_text: str, target_text: str) -> list[dict]:
        source_lines = source_text.splitlines()
        target_lines = target_text.splitlines()
        matcher = SequenceMatcher(a=source_lines, b=target_lines)
        patch: list[dict] = []
        next_id = 1

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                continue
            patch.append(
                {
                    "id": next_id,
                    "op": tag,
                    "i1": i1,
                    "i2": i2,
                    "source": "\n".join(source_lines[i1:i2]),
                    "target": "\n".join(target_lines[j1:j2]),
                }
            )
            next_id += 1
        return patch

    def apply_patch(self, source_text: str, patch: list[dict], accepted_ids: list[int]) -> str:
        source_lines = source_text.splitlines()
        accepted = set(accepted_ids)
        ordered = sorted(patch, key=lambda x: x["i1"])

        output: list[str] = []
        cursor = 0
        for item in ordered:
            i1, i2 = item["i1"], item["i2"]
            output.extend(source_lines[cursor:i1])
            if item["id"] in accepted:
                if item["target"]:
                    output.extend(item["target"].splitlines())
            else:
                output.extend(source_lines[i1:i2])
            cursor = i2

        output.extend(source_lines[cursor:])
        return "\n".join(output)

