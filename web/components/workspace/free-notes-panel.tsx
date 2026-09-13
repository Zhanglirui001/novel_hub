"use client";

import * as React from "react";
import { BookmarkPlus, NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFreeNoteActions, useFreeNotes, usePromptTemplateActions, usePromptTemplates } from "@/lib/queries";
import { useWorkspace } from "./workspace-context";

export function FreeNotesPanel() {
  const { projectId } = useWorkspace();
  const [tab, setTab] = React.useState<"notes" | "templates">("notes");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const notes = useFreeNotes(projectId);
  const templates = usePromptTemplates(projectId);
  const noteActions = useFreeNoteActions(projectId);
  const templateActions = usePromptTemplateActions(projectId);
  const save = async () => {
    if (!title.trim() || !content.trim()) return;
    if (tab === "notes") await noteActions.create.mutateAsync({ title, content, tags: [], note_type: "note" });
    else await templateActions.create.mutateAsync({ name: title, content, tags: [], applies_to: "all", is_pinned: false });
    setTitle(""); setContent("");
  };
  const items = tab === "notes" ? notes.data : templates.data;
  return <div className="flex h-full flex-col gap-3 p-3">
    <div className="flex items-center gap-1 border-b pb-2"><Button size="sm" variant={tab === "notes" ? "secondary" : "ghost"} onClick={() => setTab("notes")}>笔记</Button><Button size="sm" variant={tab === "templates" ? "secondary" : "ghost"} onClick={() => setTab("templates")}>提示词</Button></div>
    <div className="space-y-2 rounded-md border p-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={tab === "notes" ? "笔记标题" : "提示词名称"} /><Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder={tab === "notes" ? "记录情节、人物、片段或灵感" : "例如：保持克制语气，增加动作细节……"} rows={4} /><Button size="sm" onClick={() => void save()} disabled={!title.trim() || !content.trim()}><BookmarkPlus className="h-4 w-4" />保存</Button></div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{items?.map((item) => { const name = "title" in item ? item.title : item.name; return <div key={item.id} className="rounded-md border p-3"><div className="flex items-start justify-between gap-2"><div className="font-medium">{name}</div><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void ("title" in item ? noteActions.remove.mutateAsync(item.id) : templateActions.remove.mutateAsync(item.id))}><Trash2 className="h-3.5 w-3.5" /></Button></div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.content}</p></div>; })}{items?.length === 0 && <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground"><NotebookPen className="h-8 w-8" />还没有内容，先保存一条。</div>}</div>
  </div>;
}