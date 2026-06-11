"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCheckConsistency } from "@/lib/queries";
import { ConsistencyRing } from "./consistency-ring";
import { IssuesList } from "./issues-list";
import { useWorkspace } from "./workspace-context";

export function ConsistencyPanel() {
  const { projectId, draft, lastResult, setLastResult } = useWorkspace();
  const check = useCheckConsistency();

  // 优先展示最近生成结果的评分；否则展示手动检测结果。
  const score = check.data?.score ?? lastResult?.consistency_score ?? null;
  const issues = check.data?.issues ?? lastResult?.issues ?? [];

  async function handleCheck() {
    if (!draft.trim()) {
      toast.error("编辑器中没有可检测的正文");
      return;
    }
    try {
      await check.mutateAsync({ projectId, text: draft });
      // 清掉旧的生成结果评分，避免与手动检测混淆
      setLastResult(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "检测失败");
    }
  }

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        className="w-full"
        onClick={handleCheck}
        disabled={check.isPending}
      >
        {check.isPending ? "检测中…" : "对当前正文执行一致性检测"}
      </Button>

      {score !== null ? (
        <div className="space-y-4 animate-fade-in">
          <ConsistencyRing score={score} />
          <IssuesList issues={issues} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          运行检测，或在「创作」里生成后查看一致性评分与冲突报告。
        </p>
      )}
    </div>
  );
}
