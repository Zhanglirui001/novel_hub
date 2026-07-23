"use client";

import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteCharacter,
  useDeleteLoreItem,
  useImportLore,
  useLore,
} from "@/lib/queries";
import type { LoreImportRequest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

const EXAMPLE = `[{"name":"灵脉","content":"修炼体系核心","tags":["required"]}]`;

type CharRow = { name: string; profile: string };
type LoreRow = { name: string; content: string; required?: boolean };
type EventRow = { label: string; event_time: string; description: string };

const emptyChar = (): CharRow => ({ name: "", profile: "" });
const emptyLore = (): LoreRow => ({ name: "", content: "", required: false });
const emptyEvent = (): EventRow => ({ label: "", event_time: "", description: "" });

type Category = "characters" | "world_rules" | "terms" | "taboos" | "timeline";

const CATEGORY_TABS: { value: Category; label: string }[] = [
  { value: "characters", label: "角色" },
  { value: "world_rules", label: "世界规则" },
  { value: "terms", label: "术语" },
  { value: "taboos", label: "禁忌" },
  { value: "timeline", label: "时间线" },
];

export function LorePanel() {
  const { projectId } = useWorkspace();
  const { data: lore, isLoading } = useLore(projectId);
  const importLore = useImportLore(projectId);
  const deleteItem = useDeleteLoreItem(projectId);
  const deleteChar = useDeleteCharacter(projectId);

  const [showImport, setShowImport] = React.useState(false);
  const [mode, setMode] = React.useState<"structured" | "json">("structured");
  const [category, setCategory] = React.useState<Category>("characters");

  // 结构化录入行
  const [chars, setChars] = React.useState<CharRow[]>([emptyChar()]);
  const [rules, setRules] = React.useState<LoreRow[]>([emptyLore()]);
  const [terms, setTerms] = React.useState<LoreRow[]>([emptyLore()]);
  const [taboos, setTaboos] = React.useState<LoreRow[]>([emptyLore()]);
  const [events, setEvents] = React.useState<EventRow[]>([emptyEvent()]);

  // JSON 高级模式
  const [jsonChars, setJsonChars] = React.useState("[]");
  const [jsonRules, setJsonRules] = React.useState("[]");
  const [jsonTerms, setJsonTerms] = React.useState(EXAMPLE);
  const [jsonTaboos, setJsonTaboos] = React.useState("[]");
  const [jsonEvents, setJsonEvents] = React.useState("[]");

  function resetStructured() {
    setChars([emptyChar()]);
    setRules([emptyLore()]);
    setTerms([emptyLore()]);
    setTaboos([emptyLore()]);
    setEvents([emptyEvent()]);
  }

  function buildStructuredPayload(): LoreImportRequest {
    const loreOf = (rows: LoreRow[], withRequired = false) =>
      rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          content: r.content.trim(),
          tags: withRequired && r.required ? ["required"] : [],
        }));
    return {
      project_id: projectId,
      characters: chars
        .filter((r) => r.name.trim())
        .map((r) => ({ name: r.name.trim(), profile: r.profile.trim() })),
      world_rules: loreOf(rules),
      terms: loreOf(terms, true),
      taboos: loreOf(taboos),
      timeline_events: events
        .filter((r) => r.label.trim())
        .map((r) => ({
          label: r.label.trim(),
          event_time: r.event_time.trim(),
          description: r.description.trim(),
          source: "lore_import",
        })),
    };
  }

  function buildJsonPayload(): LoreImportRequest {
    return {
      project_id: projectId,
      characters: JSON.parse(jsonChars),
      world_rules: JSON.parse(jsonRules),
      terms: JSON.parse(jsonTerms),
      taboos: JSON.parse(jsonTaboos),
      timeline_events: JSON.parse(jsonEvents),
    };
  }

  function countItems(p: LoreImportRequest) {
    return (
      p.characters.length +
      p.world_rules.length +
      p.terms.length +
      p.taboos.length +
      p.timeline_events.length
    );
  }

  async function handleImport() {
    let payload: LoreImportRequest;
    try {
      payload = mode === "structured" ? buildStructuredPayload() : buildJsonPayload();
    } catch (err) {
      toast.error(`JSON 解析失败：${err instanceof Error ? err.message : ""}`);
      return;
    }
    if (countItems(payload) === 0) {
      toast.error("没有可导入的条目，请先填写内容");
      return;
    }
    try {
      const res = await importLore.mutateAsync(payload);
      toast.success(`已导入 ${res.imported_count} 项设定`);
      setShowImport(false);
      resetStructured();
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
          {/* 模式切换 */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border p-0.5">
              {(["structured", "json"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs transition-colors",
                    mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "structured" ? "表单录入" : "JSON 模式"}
                </button>
              ))}
            </div>
          </div>

          {mode === "structured" ? (
            <div className="space-y-3">
              <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
                <TabsList className="grid h-auto w-full grid-cols-5">
                  {CATEGORY_TABS.map((t) => (
                    <TabsTrigger key={t.value} value={t.value} className="px-1 py-1 text-[0.7rem]">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {category === "characters" && (
                <RowEditor
                  rows={chars}
                  onChange={setChars}
                  makeEmpty={emptyChar}
                  addLabel="添加角色"
                  render={(row, update) => (
                    <>
                      <Input
                        value={row.name}
                        onChange={(e) => update({ name: e.target.value })}
                        placeholder="角色名"
                        className="text-xs"
                      />
                      <Textarea
                        value={row.profile}
                        onChange={(e) => update({ profile: e.target.value })}
                        placeholder="角色简介 / 设定"
                        rows={2}
                        className="text-xs"
                      />
                    </>
                  )}
                />
              )}

              {(["world_rules", "terms", "taboos"] as const).map(
                (cat) =>
                  category === cat && (
                    <RowEditor
                      key={cat}
                      rows={cat === "world_rules" ? rules : cat === "terms" ? terms : taboos}
                      onChange={cat === "world_rules" ? setRules : cat === "terms" ? setTerms : setTaboos}
                      makeEmpty={emptyLore}
                      addLabel={cat === "world_rules" ? "添加规则" : cat === "terms" ? "添加术语" : "添加禁忌"}
                      render={(row, update) => (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                              value={row.name}
                              onChange={(e) => update({ name: e.target.value })}
                              placeholder="名称"
                              className="text-xs"
                            />
                            {cat === "terms" && (
                              <button
                                type="button"
                                onClick={() => update({ required: !row.required })}
                                title="标记为必检术语，参与一致性校验"
                                className={cn(
                                  "shrink-0 rounded border px-2 py-1 text-[0.65rem] transition-colors",
                                  row.required
                                    ? "border-amber-300 bg-amber-50 text-amber-700"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                              >
                                必检 ★
                              </button>
                            )}
                          </div>
                          <Textarea
                            value={row.content}
                            onChange={(e) => update({ content: e.target.value })}
                            placeholder="含义 / 内容"
                            rows={2}
                            className="text-xs"
                          />
                        </>
                      )}
                    />
                  ),
              )}

              {category === "timeline" && (
                <RowEditor
                  rows={events}
                  onChange={setEvents}
                  makeEmpty={emptyEvent}
                  addLabel="添加事件"
                  render={(row, update) => (
                    <>
                      <div className="flex items-center gap-2">
                        <Input
                          value={row.label}
                          onChange={(e) => update({ label: e.target.value })}
                          placeholder="事件标题"
                          className="text-xs"
                        />
                        <Input
                          value={row.event_time}
                          onChange={(e) => update({ event_time: e.target.value })}
                          placeholder="时间（可选）"
                          className="w-28 shrink-0 text-xs"
                        />
                      </div>
                      <Textarea
                        value={row.description}
                        onChange={(e) => update({ description: e.target.value })}
                        placeholder="事件描述"
                        rows={2}
                        className="text-xs"
                      />
                    </>
                  )}
                />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                按 JSON 数组输入，术语含 <code className="rounded bg-muted px-1">required</code> 标签将参与一致性校验。
              </p>
              <JsonField label="角色 cards" value={jsonChars} onChange={setJsonChars} />
              <JsonField label="世界规则" value={jsonRules} onChange={setJsonRules} />
              <JsonField label="术语表" value={jsonTerms} onChange={setJsonTerms} />
              <JsonField label="禁忌规则" value={jsonTaboos} onChange={setJsonTaboos} />
              <JsonField label="时间线事件" value={jsonEvents} onChange={setJsonEvents} />
            </div>
          )}

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
          <LoreGroup
            title="角色"
            items={(lore?.characters ?? []).map((c) => ({ id: c.id, label: c.name }))}
            onDelete={(id) =>
              deleteChar.mutate(id, {
                onSuccess: () => toast.success("已删除"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
              })
            }
          />
          <LoreGroup
            title="世界规则"
            items={(lore?.world_rules ?? []).map((r) => ({ id: r.id, label: r.name }))}
            onDelete={(id) =>
              deleteItem.mutate(id, {
                onSuccess: () => toast.success("已删除"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
              })
            }
          />
          <LoreGroup
            title="术语"
            items={(lore?.terms ?? []).map((t) => ({
              id: t.id,
              label: t.tags.includes("required") ? `${t.name} ★` : t.name,
            }))}
            onDelete={(id) =>
              deleteItem.mutate(id, {
                onSuccess: () => toast.success("已删除"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
              })
            }
          />
          <LoreGroup
            title="禁忌"
            items={(lore?.taboos ?? []).map((t) => ({ id: t.id, label: t.name }))}
            onDelete={(id) =>
              deleteItem.mutate(id, {
                onSuccess: () => toast.success("已删除"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

/** 通用行式编辑器：一组可增删的条目，每条内容由 render 决定。 */
function RowEditor<T>({
  rows,
  onChange,
  makeEmpty,
  addLabel,
  render,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  makeEmpty: () => T;
  addLabel: string;
  render: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="relative space-y-1.5 rounded-md border bg-background/60 p-2.5">
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="absolute right-1.5 top-1.5 text-muted-foreground/60 hover:text-destructive"
              aria-label="移除该条"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {render(row, (patch) =>
            onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))),
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full border border-dashed text-xs"
        onClick={() => onChange([...rows, makeEmpty()])}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

function JsonField({
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

function LoreGroup({
  title,
  items,
  onDelete,
}: {
  title: string;
  items: { id?: number; label: string }[];
  onDelete: (id: number) => void;
}) {
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
          {items.map((item, i) => (
            <Badge key={item.id ?? i} variant="secondary" className="group gap-1 pr-1">
              {item.label}
              {item.id != null && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id!)}
                  className="rounded-full p-0.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`删除 ${item.label}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
