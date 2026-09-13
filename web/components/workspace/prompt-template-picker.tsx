"use client";

import * as React from "react";
import { Bookmark, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePromptTemplateActions, usePromptTemplates } from "@/lib/queries";
import type { PromptTemplateScope } from "@/lib/types";

export function PromptTemplatePicker({ projectId, scope, onPick }: { projectId: number; scope: Exclude<PromptTemplateScope, "all">; onPick: (content: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const { data: templates = [] } = usePromptTemplates(projectId, { appliesTo: scope });
  const actions = usePromptTemplateActions(projectId);
  return <div className="relative">
    <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setOpen((value) => !value)}><Bookmark className="h-3.5 w-3.5" />提示词快捷键<ChevronDown className="h-3 w-3" /></Button>
    {open && <div className="absolute bottom-10 left-0 z-20 w-72 rounded-md border bg-popover p-1 shadow-lg">
      {templates.length === 0 ? <div className="p-3 text-xs text-muted-foreground">还没有适用于此场景的提示词</div> : templates.map((template) => <button key={template.id} type="button" className="block w-full rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { onPick(template.content); void actions.use.mutateAsync(template.id); setOpen(false); }}><div className="text-sm font-medium">{template.name}</div><div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.content}</div></button>)}
    </div>}
  </div>;
}