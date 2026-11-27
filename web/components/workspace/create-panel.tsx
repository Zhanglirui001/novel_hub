"use client";

import { GenerationPanel } from "./generation-panel";
import { InlineRevisePanel } from "./inline-revise-panel";
import { PatchReview } from "./patch-review";
import { useWorkspace } from "./workspace-context";

const MODES = [
  { value: "generate" as const, label: "续写 / 润色" },
  { value: "revise" as const, label: "改写" },
  { value: "patch" as const, label: "补丁" },
];

/** 「创作」合并面板：续写/润色、改写、补丁审核三个子模式，内部切换（状态挂在 workspace context）。 */
export function CreatePanel({ fullscreen }: { fullscreen?: boolean }) {
  const { createMode, setCreateMode } = useWorkspace();

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setCreateMode(m.value)}
            className={
              "flex-1 rounded-md px-2 py-1.5 transition " +
              (createMode === m.value
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      {createMode === "generate" && <GenerationPanel fullscreen={fullscreen} />}
      {createMode === "revise" && <InlineRevisePanel fullscreen={fullscreen} />}
      {createMode === "patch" && <PatchReview fullscreen={fullscreen} />}
    </div>
  );
}
