"use client";

import * as React from "react";
import { Check, Pencil, RotateCcw, RotateCw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReviseSelection } from "@/lib/queries";
import { diffChars } from "@/lib/diff";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

// 正文里就地展示的主预览：默认 diff 视图，可切到手动编辑。
export function InlineDiffCard() {
  const {
    projectId,
    chapterTitle,
    reviseTarget,
    candidates,
    activeCandidateId,
    updateCandidateText,
    addCandidate,
    replaceRange,
    clearRevise,
  } = useWorkspace();

  const [editing, setEditing] = React.useState(false);
  const reviseMutation = useReviseSelection();

  const active = candidates.find((c) => c.id === activeCandidateId) ?? null;

  // 切换候选时退出编辑态，避免编辑框停留在旧版本。
  React.useEffect(() => {
    setEditing(false);
  }, [activeCandidateId]);

  if (!reviseTarget || !active) return null;

  const segs = diffChars(reviseTarget.originalText, active.editedText);

  const adopt = () => {
    replaceRange(reviseTarget.start, reviseTarget.end, active.editedText);
    toast.success("已采纳并替换选段");
    clearRevise();
  };

  const regenerate = async () => {
    try {
      const res = await reviseMutation.mutateAsync({
        project_id: projectId,
        selection: reviseTarget.originalText,
        prefix: reviseTarget.prefix,
        suffix: reviseTarget.suffix,
        annotation: active.annotation,
        analysis: active.analysis,
        chapter_title: chapterTitle,
        budget: "medium",
        target_latency_ms: 6000,
      });
      addCandidate({
        resultText: res.result_text,
        editedText: res.result_text,
        annotation: active.annotation,
        analysis: active.analysis,
        consistencyScore: res.consistency_score,
      });
      toast.success("已生成新版本");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重新生成失败");
    }
  };

  return (
    <span
      contentEditable={false}
      className="my-1 inline-block w-full select-none rounded-lg border border-primary/30 bg-card/60 align-top shadow-sm"
    >
      {/* 头部标签 + 操作条 */}
      <span className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs">
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="font-medium text-foreground">{active.label}</span>
          <span className="rounded bg-muted px-1.5 py-0.5">
            一致性 {active.consistencyScore}
          </span>
          {editing && <span className="text-warning">编辑中</span>}
        </span>
        <span className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setEditing((v) => !v)}
            title="手动编辑修改后的文本"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? "完成" : "编辑"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => void regenerate()}
            disabled={reviseMutation.isPending}
            title="按同样批注再生成一个版本"
          >
            <RotateCw className="h-3.5 w-3.5" />
            {reviseMutation.isPending ? "生成中…" : "重新生成"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={clearRevise}
            title="放弃预览，回到编辑"
          >
            <X className="h-3.5 w-3.5" />
            放弃
          </Button>
        </span>
      </span>

      {/* 主体：diff 或编辑框 */}
      <span className="block px-3 py-2.5">
        {editing ? (
          <Textarea
            value={active.editedText}
            onChange={(e) => updateCandidateText(active.id, e.target.value)}
            autoFocus
            rows={Math.min(16, Math.max(3, active.editedText.split("\n").length + 1))}
            className="prose-editor w-full resize-y text-[1.075rem] leading-[1.95]"
          />
        ) : (
          <span className="prose-editor block whitespace-pre-wrap break-words text-[1.075rem] leading-[1.95]">
            {segs.map((seg, i) => (
              <span
                key={i}
                className={cn(
                  seg.type === "del" &&
                    "bg-destructive/10 text-destructive line-through decoration-destructive/50",
                  seg.type === "ins" && "bg-success/15 text-foreground",
                )}
              >
                {seg.text}
              </span>
            ))}
          </span>
        )}
      </span>

      {/* 底部：采纳 */}
      <span className="flex items-center justify-end gap-2 border-t px-3 py-2">
        <Button size="sm" variant="ghost" className="gap-1" onClick={clearRevise}>
          <RotateCcw className="h-3.5 w-3.5" />
          放弃
        </Button>
        <Button size="sm" className="gap-1" onClick={adopt}>
          <Check className="h-4 w-4" />
          采纳并替换
        </Button>
      </span>
    </span>
  );
}
