"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBuildStyleProfile, useStyleProfile } from "@/lib/queries";
import { useWorkspace } from "./workspace-context";

const povLabels: Record<string, string> = {
  first_person: "第一人称",
  third_person: "第三人称",
};
const cadenceLabels: Record<string, string> = {
  fast: "明快",
  balanced: "均衡",
  slow: "舒缓",
};

export function StylePanel() {
  const { projectId } = useWorkspace();
  const { data: profile } = useStyleProfile(projectId);
  const build = useBuildStyleProfile(projectId);
  const [samples, setSamples] = React.useState("");

  async function handleBuild() {
    const items = samples
      .split("\n---\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) {
      toast.error("至少输入一段样本文本");
      return;
    }
    try {
      await build.mutateAsync({ project_id: projectId, name: "default", samples: items });
      toast.success("文风画像已更新");
      setSamples("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    }
  }

  return (
    <div className="space-y-5">
      {profile && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="平均句长" value={`${profile.avg_sentence_length} 字`} />
          <Stat label="样本数" value={String(profile.sample_count)} />
          <Stat label="视角" value={povLabels[profile.pov] ?? profile.pov} />
          <Stat label="节奏" value={cadenceLabels[profile.cadence] ?? profile.cadence} />
        </div>
      )}

      {profile && profile.top_words.length > 0 && (
        <div>
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            高频词
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {profile.top_words.map((w, i) => (
              <Badge key={i} variant="outline">
                {w}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 border-t pt-4">
        <Label className="text-xs">
          输入作者历史文本（用 <code className="rounded bg-muted px-1">---</code> 单独成行分隔多段）
        </Label>
        <Textarea
          value={samples}
          onChange={(e) => setSamples(e.target.value)}
          rows={6}
          placeholder={"第一段样本…\n---\n第二段样本…"}
          className="soft-scroll"
        />
        <Button className="w-full" onClick={handleBuild} disabled={build.isPending}>
          {build.isPending ? "分析中…" : "生成文风画像"}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
