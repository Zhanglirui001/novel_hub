"use client";

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { recovery } from '@/lib/recovery';
import { api } from '@/lib/api';
import type { Chapter } from '@/lib/types';
import { useWorkspace } from './workspace-context';

type Version = { id: number; title: string; version: number; recorded_at: string; character_count: number };
type Snapshot = Version & { content: string; group_title: string };

export function ChapterHistory() {
  const { activeChapterId, loadChapter, saveStatus, projectId, ghostStreaming, reviseTarget } = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [versions, setVersions] = React.useState<Version[]>([]);
  const [more, setMore] = React.useState(false);
  const [selected, setSelected] = React.useState<Snapshot | null>(null);
  const [baseline, setBaseline] = React.useState<Chapter | null>(null);
  const client = useQueryClient();
  const blocked = saveStatus !== 'saved' || ghostStreaming || !!reviseTarget;
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : '历史记录操作失败'); }
    finally { setBusy(false); }
  }
  async function list(before?: number) {
    const rows = await recovery<Version[]>(`/chapters/${activeChapterId}/versions${before ? `?before=${before}` : ''}`);
    setVersions(prev => before ? [...prev, ...rows] : rows); setMore(rows.length === 100);
  }
  return <Dialog open={open} onOpenChange={value => {
    if (busy) return;
    setOpen(value); setSelected(null);
    if (value) void act(async () => { setBaseline(await api.getChapter(activeChapterId!)); await list(); });
  }}>
    <DialogTrigger asChild><Button size="sm" variant="outline" disabled={!activeChapterId || blocked} title="保存当前修改后查看或恢复历史版本">历史</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>章节版本历史</DialogTitle><DialogDescription>每次正文或标题变化都会保留快照。恢复会保存为新版本，现有历史仍可找回。</DialogDescription></DialogHeader>
      <div className="grid min-h-64 grid-cols-[180px_1fr] gap-4">
        <div className="max-h-96 space-y-2 overflow-auto">{versions.map(item => <button key={item.id} disabled={busy} className={`w-full rounded-md border p-2 text-left text-xs ${selected?.id === item.id ? 'bg-muted' : ''}`} onClick={() => void act(async () => setSelected(await recovery<Snapshot>(`/chapters/${activeChapterId}/versions/${item.id}`)))}>
          <p>v{item.version} · {item.character_count} 字</p><p className="text-muted-foreground">{new Date(item.recorded_at).toLocaleString()}</p>
        </button>)}{more && <Button size="sm" disabled={busy} onClick={() => void act(async () => list(versions.at(-1)?.id))}>加载更早版本</Button>}</div>
        <div className="min-w-0"><p className="mb-2 font-medium">{selected?.title || '选择一个版本预览'}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-7">{selected?.content}</pre></div>
      </div>
      <Button disabled={busy || !selected || !baseline || blocked} onClick={() => void act(async () => {
        const restored = await recovery<Chapter>(`/chapters/${activeChapterId}/versions/${selected!.id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_version: baseline!.version, expected_updated_at: baseline!.updated_at }) });
        loadChapter(restored.id, restored.title, restored.content, restored.group_title);
        await client.invalidateQueries({ queryKey: ['chapters', projectId] });
        await client.invalidateQueries({ queryKey: ['backup-status', activeChapterId] });
        setOpen(false); toast.success('已恢复为新版本');
      })}>{busy ? '处理中…' : '将预览内容恢复为新版本'}</Button>
    </DialogContent>
  </Dialog>;
}
