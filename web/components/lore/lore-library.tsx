"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePrompt } from "@/components/ui/use-prompt";
import { api } from "@/lib/api";

type Kind = "character" | "world";

type Item = { id: number; name: string; content: string; tags?: string[] };

export function LoreLibrary({ projectId, kind }: { projectId: number; kind: Kind }) {
  const qc = useQueryClient();
  const { confirm, dialogs } = usePrompt();
  const isChar = kind === "character";

  const { data, isLoading } = useQuery({
    queryKey: ["lore", projectId],
    queryFn: () => api.getLore(projectId),
  });

  const items: Item[] = isChar
    ? (data?.characters ?? []).map((c) => ({ id: c.id, name: c.name, content: c.profile }))
    : (data?.world_rules ?? []).map((w) => ({ id: w.id, name: w.name, content: w.content, tags: w.tags }));

  const [editor, setEditor] = useState<{ id?: number; name: string; content: string } | null>(null);

  const save = useMutation({
    mutationFn: async (m: { id?: number; name: string; content: string }) => {
      if (isChar) {
        return m.id
          ? api.updateCharacter(projectId, m.id, { name: m.name, profile: m.content })
          : api.createCharacter(projectId, { name: m.name, profile: m.content });
      }
      return m.id
        ? api.updateLoreItem(projectId, m.id, { name: m.name, content: m.content })
        : api.createLoreItem(projectId, { name: m.name, content: m.content });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lore", projectId] });
      setEditor(null);
      toast.success("已保存");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const remove = useMutation({
    mutationFn: async (itemId: number) =>
      isChar ? api.deleteCharacter(projectId, itemId) : api.deleteLoreItem(projectId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lore", projectId] });
      toast.success("已删除");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  function submit() {
    if (!editor) return;
    if (!editor.name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    save.mutate(editor);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${projectId}/lore`}>← 返回设定</Link>
          </Button>
          <h1 className="truncate text-xl font-semibold">{isChar ? "角色库" : "世界观设定库"}</h1>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {items.length} 条
          </span>
        </div>
        <Button size="sm" onClick={() => setEditor({ name: "", content: "" })}>
          <Plus className="mr-1 h-4 w-4" /> 新增{isChar ? "角色" : "设定"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <LoreCard
              key={it.id}
              name={it.name}
              content={it.content}
              tags={it.tags}
              onEdit={() => setEditor({ id: it.id, name: it.name, content: it.content })}
              onDelete={() => {
                void confirm(`删除「${it.name}」？`).then((ok) => {
                  if (ok) remove.mutate(it.id);
                });
              }}
            />
          ))}
          {!items.length && (
            <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              还没有{isChar ? "角色卡" : "世界观设定"}，点右上「新增」开始
            </div>
          )}
        </div>
      )}

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? "编辑" : "新增"}
              {isChar ? "角色卡" : "世界观设定"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="名称"
              value={editor?.name ?? ""}
              onChange={(e) => setEditor((s) => (s ? { ...s, name: e.target.value } : s))}
            />
            <Textarea
              placeholder="内容 / 描述"
              className="min-h-[140px]"
              value={editor?.content ?? ""}
              onChange={(e) => setEditor((s) => (s ? { ...s, content: e.target.value } : s))}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditor(null)}>取消</Button>
            <Button onClick={submit} disabled={save.isPending}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
      {dialogs}
    </div>
  );
}

function LoreCard({
  name,
  content,
  tags,
  onEdit,
  onDelete,
}: {
  name: string;
  content: string;
  tags?: string[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex flex-col rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold">{name}</div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={onEdit} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary" title="编辑">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600" title="删除">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-2 line-clamp-6 text-xs leading-relaxed text-muted-foreground">{content || "—"}</p>
      {tags && tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
