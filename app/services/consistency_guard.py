from __future__ import annotations

import re
from dataclasses import asdict, dataclass


@dataclass
class ConsistencyIssue:
    issue_type: str
    severity: str
    message: str
    suggestion: str


class ConsistencyGuard:
    def check(self, text: str, context: dict) -> dict:
        issues: list[ConsistencyIssue] = []

        for taboo in context.get("taboos", []):
            keyword = taboo.get("name", "")
            if keyword and keyword in text:
                issues.append(
                    ConsistencyIssue(
                        issue_type="taboo_violation",
                        severity="high",
                        message=f"命中禁忌词: {keyword}",
                        suggestion=f"删除或替换与 {keyword} 相关的表达",
                    )
                )

        for term in context.get("terms", []):
            required = term.get("name", "")
            if required and term.get("tags") and "required" in term["tags"] and required not in text:
                issues.append(
                    ConsistencyIssue(
                        issue_type="term_missing",
                        severity="medium",
                        message=f"关键术语缺失: {required}",
                        suggestion="补充关键术语以保持世界观一致",
                    )
                )

        years = [int(y) for y in re.findall(r"(\d{4})年", text)]
        if len(years) >= 2 and years != sorted(years):
            issues.append(
                ConsistencyIssue(
                    issue_type="timeline_conflict",
                    severity="medium",
                    message="文本中的年份顺序疑似倒序",
                    suggestion="按事件发生顺序重排时间线描述",
                )
            )

        for character in context.get("characters", []):
            name = character.get("name", "")
            profile = character.get("profile", "")
            if name and name in text and "禁用" in profile:
                match = re.search(r"禁用[:：]\s*([^，。；;\n]+)", profile)
                if match and match.group(1) in text:
                    forbidden = match.group(1)
                    issues.append(
                        ConsistencyIssue(
                            issue_type="ooc_risk",
                            severity="high",
                            message=f"角色 {name} 出现违背人设的行为关键词: {forbidden}",
                            suggestion="改为符合角色设定的行为或心理活动",
                        )
                    )

        high = sum(1 for i in issues if i.severity == "high")
        medium = sum(1 for i in issues if i.severity == "medium")
        low = sum(1 for i in issues if i.severity == "low")
        score = max(0, 100 - high * 25 - medium * 12 - low * 6)
        return {"score": score, "issues": [asdict(i) for i in issues]}

    def repair(self, text: str, issues: list[dict], context: dict) -> str:
        repaired = text
        for issue in issues:
            if issue["issue_type"] == "taboo_violation":
                keyword = issue["message"].split(":", 1)[-1].strip()
                repaired = repaired.replace(keyword, "[已修正]", 5)
        return repaired

