"use client";

import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useImportLore, useLore } from "@/lib/queries";
import type { LoreImportRequest } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

const EXAMPLE = `[{"name":"灵脉","content":"修炼体系核心","tags":["required"]}]`;

export function LorePanel() {
  const { projectId } = useWorkspace();
  const { data: lore, isLoading } = useLore(projectId);
  const importLore = useImportLore(projectId);

  const [chars, setChars] = React.useState("[]");
  const [rules, setRules] = React.useState("[]");
  const [terms, setTerms] = React.useState(EXAMPLE);
  const [taboos, setTaboos] = React.useState("[]");
  const [showImport, setShowImport] = React.useState(false);

  async function handleImport() {
    let payload: LoreImportRequest;
    try {
      payload = {
        project_id: projectId,
        characters: JSON.parse(chars),
        world_rules: JSON.parse(rules),
        terms: JSON.parse(terms),
        taboos: JSON.parse(taboos),
        timeline_events: [],
      };
    } catch (err) {
      toast.error(`JSON 解析失败：${err instanceof Error ? err.message : ""}`);
      return;
    }
    try {
      const res = await importLore.mutateAsync(payload);
      toast.success(`已导入 ${res.imported_count} 项设定`);
      setShowImport(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">当前设定</h3>
        <Button variant="outline" size="sm" onClick={() => setShowImport((s) => !s)}>
          {showImport ? "收起导入" : "导入设定"}
        </Button>
      </div>

      {showImport && (
        <div className="space-y-3 rounded-lg border bg-card/50 p-4 animate-fade-in">
          <p className="text-xs text-muted-foreground">
            按 JSON 数组输入，术语含 <code className="rounded bg-muted px-1">required</code> 标签将参与一致性校验。
          </p>
          <LoreField label="角色 cards" value={chars} onChange={setChars} />
          <LoreField label="世界规则" value={rules} onChange={setRules} />
          <LoreField label="术语表" value={terms} onChange={setTerms} />
          <LoreField label="禁忌规则" value={taboos} onChange={setTaboos} />
          <Button
            className="w-full"
            size="sm"
            onClick={handleImport}
            disabled={importLore.isPending}
          >
            {importLore.isPending ? "导入中…" : "确认导入"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : (
        <div className="space-y-4">
          <LoreGroup title="角色" items={lore?.characters.map((c) => c.name) ?? []} />
          <LoreGroup title="世界规则" items={lore?.world_rules.map((r) => r.name) ?? []} />
          <LoreGroup
            title="术语"
            items={
              lore?.terms.map((t) =>
                t.tags.includes("required") ? `${t.name} ★` : t.name
              ) ?? []
            }
          />
          <LoreGroup title="禁忌" items={lore?.taboos.map((t) => t.name) ?? []} />
        </div>
      )}
    </div>
  );
}

function LoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}（JSON）</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="font-mono text-xs"
      />
    </div>
  );
}

function LoreGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">暂无</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((name, i) => (
            <Badge key={i} variant="secondary">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
