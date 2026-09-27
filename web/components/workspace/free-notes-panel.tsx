"use client";

import * as React from "react";
import { BookmarkPlus, Edit3, NotebookPen, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFreeNoteActions, useFreeNotes, usePromptTemplateActions, usePromptTemplates } from "@/lib/queries";
import { useWorkspace } from "./workspace-context";

const NOTE_TYPES = [
  { value: "idea", label: "灵感" },
  { value: "plot", label: "情节" },
  { value: "character", label: "人物" },
  { value: "fragment", label: "片段" },
  { value: "research", label: "研究" },
  { value: "note", label: "随笔" },
] as const;

export function FreeNotesPanel() {
  const { projectId } = useWorkspace();
  const [tab, setTab] = React.useState<"notes" | "templates">("notes");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [noteType, setNoteType] = React.useState<(typeof NOTE_TYPES)[number]["value"]>("idea");
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [editingContent, setEditingContent] = React.useState("");
  const [editingType, setEditingType] = React.useState<(typeof NOTE_TYPES)[number]["value"]>("idea");

  const notes = useFreeNotes(projectId);
  const templates = usePromptTemplates(projectId);
  const noteActions = useFreeNoteActions(projectId);
  const templateActions = usePromptTemplateActions(projectId);

  const save = async () => {
    if (!title.trim() || !content.trim()) return;
    if (tab === "notes") {
      await noteActions.create.mutateAsync({ title, content, tags: [], note_type: noteType });
    } else {
      await templateActions.create.mutateAsync({ name: title, content, tags: [], applies_to: "all", is_pinned: false });
    }
    setTitle("");
    setContent("");
    setNoteType("idea");
  };

  type EditableItem = {
    id: number;
    title?: string;
    name?: string;
    content: string;
    note_type?: string;
  };

  const startEdit = (item: EditableItem) => {
    const noteName = typeof item.title === "string" ? item.title : item.name ?? "";
    setEditingId(item.id);
    setEditingTitle(noteName);
    setEditingContent(item.content);
    setEditingType(item.note_type && NOTE_TYPES.some((entry) => entry.value === item.note_type) ? (item.note_type as (typeof NOTE_TYPES)[number]["value"]) : "idea");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingContent("");
  };

  const saveEdit = async () => {
    if (editingId === null || !editingTitle.trim() || !editingContent.trim()) return;
    if (tab === "notes") {
      await noteActions.update.mutateAsync({ noteId: editingId, payload: { title: editingTitle, content: editingContent, note_type: editingType } });
    } else {
      await templateActions.update.mutateAsync({ templateId: editingId, payload: { name: editingTitle, content: editingContent } });
    }
    cancelEdit();
  };

  const items = (tab === "notes" ? (notes.data ?? []) : (templates.data ?? [])) as EditableItem[];

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-1 border-b pb-2">
        <Button size="sm" variant={tab === "notes" ? "secondary" : "ghost"} onClick={() => setTab("notes")}>笔记</Button>
        <Button size="sm" variant={tab === "templates" ? "secondary" : "ghost"} onClick={() => setTab("templates")}>提示词</Button>
      </div>

      <div className="space-y-2 rounded-md border p-2">
        {tab === "notes" ? (
          <>
            <div className="flex items-center gap-2">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="笔记标题" className="flex-1" />
              <select value={noteType} onChange={(event) => setNoteType(event.target.value as (typeof NOTE_TYPES)[number]["value"])} className="h-10 rounded-md border bg-background px-2 text-sm">
                {NOTE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="记录情节、人物、片段或灵感" rows={4} />
          </>
        ) : (
          <>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="提示词名称" />
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="例如：保持克制语气，增加动作细节……" rows={4} />
          </>
        )}
        <Button size="sm" onClick={() => void save()} disabled={!title.trim() || !content.trim()}>
          <BookmarkPlus className="h-4 w-4" />
          保存
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {items?.map((item) => {
          const name = typeof item.title === "string" ? item.title : item.name ?? "";
          const isEditing = editingId === item.id && tab === (typeof item.title === "string" ? "notes" : "templates");

          return (
            <div key={item.id} className="rounded-md border p-3">
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} className="flex-1" />
                    {tab === "notes" ? (
                      <select value={editingType} onChange={(event) => setEditingType(event.target.value as (typeof NOTE_TYPES)[number]["value"])} className="h-10 rounded-md border bg-background px-2 text-sm">
                        {NOTE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    ) : null}
                  </div>
                  <Textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} rows={4} />
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={cancelEdit}><X className="h-3.5 w-3.5" />取消</Button>
                    <Button size="sm" onClick={() => void saveEdit()}><Save className="h-3.5 w-3.5" />保存</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{name}</div>
                      {tab === "notes" && "note_type" in item ? (
                        <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{NOTE_TYPES.find((entry) => entry.value === item.note_type)?.label ?? "其他"}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(item as any)}><Edit3 className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void ("title" in item ? noteActions.remove.mutateAsync(item.id) : templateActions.remove.mutateAsync(item.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.content}</p>
                </>
              )}
            </div>
          );
        })}

        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <NotebookPen className="h-8 w-8" />
            还没有内容，先保存一条。
          </div>
        )}
      </div>
    </div>
  );
}