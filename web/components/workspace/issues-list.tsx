"use client";

import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ConsistencyIssue, Severity } from "@/lib/types";

const severityMeta: Record<
  Severity,
  { label: string; badge: "destructive" | "warning" | "secondary"; icon: typeof AlertTriangle; accent: string }
> = {
  high: { label: "高", badge: "destructive", icon: ShieldAlert, accent: "border-l-destructive" },
  medium: { label: "中", badge: "warning", icon: AlertTriangle, accent: "border-l-warning" },
  low: { label: "低", badge: "secondary", icon: Info, accent: "border-l-muted-foreground/40" },
};

const issueTypeLabels: Record<string, string> = {
  taboo_violation: "禁忌触发",
  term_missing: "术语缺失",
  timeline_conflict: "时间线冲突",
  ooc_risk: "人设偏离",
};

export function IssuesList({ issues }: { issues: ConsistencyIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
        <p className="text-sm font-medium">没有发现一致性问题</p>
        <p className="text-xs text-muted-foreground">设定、术语与时间线均通过校验</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {issues.map((issue, i) => {
        const meta = severityMeta[issue.severity] ?? severityMeta.low;
        const Icon = meta.icon;
        return (
          <li
            key={i}
            className={`rounded-lg border border-l-4 bg-card p-3.5 ${meta.accent}`}
          >
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant={meta.badge}>{meta.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {issueTypeLabels[issue.issue_type] ?? issue.issue_type}
                  </span>
                </div>
                <p className="text-sm font-medium leading-snug">{issue.message}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  建议：{issue.suggestion}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
