"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePrompt } from "@/components/ui/use-prompt";
import { api } from "@/lib/api";
import type { OutlineNode } from "@/lib/types";

const KIND_LABEL: Record<string, string> = { volume: "卷", chapter: "章", scene: "场景", beat: "细纲" };
const KIND_COLOR: Record<string, string> = {
  volume: "bg-violet-100 text-violet-700",
  chapter: "bg-blue-100 text-blue-700",
  scene: "bg-teal-100 text-teal-700",
  beat: "bg-amber-100 text-amber-700",
};

function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind;
}

function childKind(kind: string) {
  if (kind === "volume") return "chapter";
  if (kind === "chapter") return "scene";
  if (kind === "scene") return "beat";
  return "scene";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mut = { mutate: (args: any) => void };

function TreeNode({
  node,
  depth,
  createNode,
  updateNode,
  deleteNode,
  prompt,
  confirm,
}: {
  node: OutlineNode;
  depth: number;
  createNode: Mut;
  updateNode: Mut;
  deleteNode: Mut;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prompt: (title: string, d?: string) => Promise<string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirm: (msg: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(true);
  const [summary, setSummary] = useState(node.summary ?? "");

  async function rename() {
    const next = await prompt("修改标题", node.title);
    if (next === null || !next.trim() || next === node.title) return;
    updateNode.mutate({ nodeId: node.id, payload: { title: next.trim() } });
  }

  async function addChild() {
    const kind = childKind(node.kind);
    const title = await prompt(`新增${kindLabel(kind)}标题`);
    if (!title?.trim()) return;
    createNode.mutate({ parent_id: node.id, kind, title: title.trim() });
  }

  async function remove() {
    if (await confirm(`删除「${node.title}」及其所有子节点？`)) {
      deleteNode.mutate(node.id);
    }
  }

  function saveSummary() {
    if (summary !== (node.summary ?? "")) {
      updateNode.mutate({ nodeId: node.id, payload: { summary } });
    }
  }

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="group flex items-center gap-1.5 rounded px-1 py-1 hover:bg-muted/60">
        <button onClick={() => setOpen((o) => !o)} className="text-muted-foreground" aria-label="折叠/展开">
          {node.children && node.children.length > 0 ? (
            open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </button>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_COLOR[node.kind] ?? "bg-zinc-100 text-zinc-600"}`}>
          {kindLabel(node.kind)}
        </span>
        <button onClick={rename} className="flex-1 truncate text-left text-sm" title="点击修改标题">
          {node.title}
        </button>
        <div className="hidden items-center gap-1 group-hover:flex">
          <button onClick={addChild} className="rounded p-1 text-muted-foreground hover:bg-muted" title="新增子节点">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={remove} className="rounded p-1 text-rose-600 hover:bg-rose-50" title="删除">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {open && (
        <>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={saveSummary}
            placeholder={`${kindLabel(node.kind)}的细纲 / 摘要…`}
            className="mb-1 mt-1 min-h-[3rem] text-sm"
          />
          {(node.children ?? []).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              createNode={createNode}
              updateNode={updateNode}
              deleteNode={deleteNode}
              prompt={prompt}
              confirm={confirm}
            />
          ))}
        </>
      )}
    </div>
  );
}

export default function OutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = Number(id);
  const queryClient = useQueryClient();
  const { prompt, confirm, dialogs } = usePrompt();

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["outline", projectId],
    queryFn: () => api.listOutline(projectId),
  });

  const createNode = useMutation({
    mutationFn: (p: { parent_id: number | null; kind: string; title: string }) => api.createOutlineNode(projectId, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outline", projectId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "新增失败"),
  });

  const updateNode = useMutation({
    mutationFn: (p: { nodeId: number; payload: Record<string, unknown> }) => api.updateOutlineNode(p.nodeId, p.payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outline", projectId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "更新失败"),
  });

  const deleteNode = useMutation({
    mutationFn: (nodeId: number) => api.deleteOutlineNode(nodeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outline", projectId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  async function addRoot() {
    const title = await prompt("新建顶层节点（卷）标题");
    if (!title?.trim()) return;
    createNode.mutate({ parent_id: null, kind: "volume", title: title.trim() });
  }

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${projectId}`}>← 返回</Link>
          </Button>
          <h1 className="text-lg font-semibold">故事大纲</h1>
        </div>
        <Button size="sm" onClick={addRoot} disabled={createNode.isPending}>
          <Plus className="mr-1 h-4 w-4" /> 新增卷
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : tree.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          还没有大纲。点「新增卷」开始，或回到对话框让剧情研讨 / 节奏编排 agent 帮你逐步生成。
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          {tree.map((n) => (
            <TreeNode
              key={n.id}
              node={n}
              depth={0}
              createNode={createNode}
              updateNode={updateNode}
              deleteNode={deleteNode}
              prompt={prompt}
              confirm={confirm}
            />
          ))}
        </div>
      )}
      {dialogs}
    </div>
  );
}
