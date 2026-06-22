"use client";

import * as React from "react";
import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

// 右栏「版本」面板：列出同一选区的多个候选修改，点击即换成主预览。
export function InlineRevisePanel() {
  const {
    candidates,
    activeCandidateId,
    setActiveCandidate,
    removeCandidate,
    reviseTarget,
  } = useWorkspace();

  if (!reviseTarget || candidates.length === 0) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">还没有可对比的版本</p>
        <p>
          在编辑器中选中一段文字，用底部浮层生成修改后，正文会就地显示 diff 预览，
          这里则列出可对比的多个版本——点击任意一张即可切换主预览。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        共 {candidates.length} 个版本 · 点击卡片切换主预览
      </p>
      <ul className="space-y-2.5">
        {candidates.map((c) => {
          const isActive = c.id === activeCandidateId;
          return (
            <li
              key={c.id}
              onClick={() => setActiveCandidate(c.id)}
              className={cn(
                "cursor-pointer rounded-lg border p-3 transition-colors",
                isActive
                  ? "border-primary/40 bg-accent/40"
                  : "bg-card hover:bg-accent/20",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.label}</span>
                  {isActive && (
                    <span className="flex items-center gap-0.5 text-xs text-primary">
                      <Check className="h-3.5 w-3.5" />
                      预览中
                    </span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    一致性 {c.consistencyScore}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCandidate(c.id);
                  }}
                  title="删除该版本"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {c.annotation.trim() && (
                <p className="mb-1 line-clamp-1 text-xs text-muted-foreground">
                  批注：{c.annotation}
                </p>
              )}
              <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                {c.editedText}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
