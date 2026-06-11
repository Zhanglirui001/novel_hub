"use client";

import * as React from "react";
import { Check, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApplyPatch } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { PatchItem, PatchOp } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

const opMeta: Record<PatchOp, { label: string; badge: "warning" | "success" | "destructive" }> = {
  replace: { label: "替换", badge: "warning" },
  insert: { label: "新增", badge: "success" },
  delete: { label: "删除", badge: "destructive" },
};

export function PatchReview() {
  const { projectId, lastResult, chapterTitle, loadChapter } = useWorkspace();
  const applyPatch = useApplyPatch(projectId);
  const [accepted, setAccepted] = React.useState<Set<number>>(new Set());

  const patchItems = lastResult?.patch_items ?? [];

  // 每次生成出新结果时，默认全选采纳。
  React.useEffect(() => {
    setAccepted(new Set(patchItems.map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult?.patch_set_id]);

  if (!lastResult) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        先在「创作」里生成续写或润色，这里会列出可逐条采纳的修改。
      </p>
    );
  }

  if (patchItems.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        本次生成与原文一致，没有需要应用的修改。
      </p>
    );
  }

  function toggle(id: number) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApply() {
    if (!lastResult) return;
    try {
      const res = await applyPatch.mutateAsync({
        patchSetId: lastResult.patch_set_id,
        acceptedIds: Array.from(accepted),
        chapterTitle,
      });
      loadChapter(res.chapter_id, chapterTitle, res.applied_text);
      toast.success(`已保存《${chapterTitle}》v${res.version}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "应用补丁失败");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          已选 {accepted.size} / {patchItems.length} 条
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAccepted(new Set(patchItems.map((p) => p.id)))}
          >
            全选
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAccepted(new Set())}>
            全不选
          </Button>
        </div>
      </div>

      <ul className="space-y-3">
        {patchItems.map((item) => (
          <PatchRow
            key={item.id}
            item={item}
            checked={accepted.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </ul>

      <Button
        className="w-full"
        onClick={handleApply}
        disabled={applyPatch.isPending}
      >
        <Save className="h-4 w-4" />
        {applyPatch.isPending ? "保存中…" : "应用所选并保存章节"}
      </Button>
    </div>
  );
}

function PatchRow({
  item,
  checked,
  onToggle,
}: {
  item: PatchItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = opMeta[item.op] ?? opMeta.replace;
  return (
    <li
      className={cn(
        "rounded-lg border p-3 transition-colors",
        checked ? "border-primary/40 bg-accent/40" : "bg-card"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={meta.badge}>{meta.label}</Badge>
          <span className="text-xs text-muted-foreground">第 {item.i1 + 1} 行起</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded border transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input"
          )}
          aria-label={checked ? "取消采纳" : "采纳"}
        >
          {checked && <Check className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="space-y-1.5 text-sm">
        {item.source && (
          <p className="rounded bg-destructive/10 px-2 py-1 text-destructive line-through decoration-destructive/50">
            {item.source}
          </p>
        )}
        {item.target && (
          <p className="rounded bg-success/10 px-2 py-1 text-foreground">
            {item.target}
          </p>
        )}
      </div>
    </li>
  );
}
