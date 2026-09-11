"use client";

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { backupText, recovery, saveBackup } from '@/lib/recovery';

type Backup = { name: string; created_at: string; size: number };
type LibraryPreview = { created_at: string; projects: number; chapters: number; versions: number; sha256: string };
type ProjectPreview = { created_at: string; name: string; chapters: number; versions: number; sha256: string };

export function LibraryRecovery() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [library, setLibrary] = React.useState<{ raw: string; preview: LibraryPreview } | null>(null);
  const [project, setProject] = React.useState<{ raw: string; preview: ProjectPreview } | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const client = useQueryClient();
  const backups = useQuery({ queryKey: ['library-backups'], queryFn: () => recovery<Backup[]>('/backups'), enabled: open });
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  }
  async function inspect(raw: string) {
    setLibrary(null); setProject(null); setConfirmed(false);
    let format: string | undefined;
    try { format = JSON.parse(raw).format; } catch { throw new Error('备份文件无法读取'); }
    if (format === 'novelhub-project') {
      setProject({ raw, preview: await recovery<ProjectPreview>('/projects/preview', { method: 'POST', body: raw }) });
      return;
    }
    setLibrary({ raw, preview: await recovery<LibraryPreview>('/preview', { method: 'POST', body: raw }) });
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); setLibrary(null); setProject(null); setConfirmed(false); } }}>
    <DialogTrigger asChild><Button variant="outline">备份与恢复</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>书架备份与恢复</DialogTitle><DialogDescription>保存全部作品、设定、画板、对话和章节历史。也可导入单部作品而不替换现有书架。备份不包含 API 密钥；整库恢复会保留本机模型配置。</DialogDescription></DialogHeader>
      <p className="text-xs text-muted-foreground">应用启动时每天自动备份一次。建议定期另存到其他磁盘。备份上限 128 MB，自动备份不会自动删除。</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void act(async () => {
          const result = await recovery<{ name: string }>('/backups', { method: 'POST' });
          await backups.refetch();
          toast.success('完整书架已备份到本机');
          await saveBackup(result.name);
        })}>{busy ? '处理中…' : '创建完整备份并另存'}</Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm">
          导入备份或作品
          <input type="file" accept=".novelhub,.novelhub-project" className="sr-only" disabled={busy} onChange={(e) => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (file) void act(async () => {
              if (file.size > 128 * 1024 * 1024) throw new Error('备份不能超过 128 MB');
              await inspect(await file.text());
            });
          }} />
        </label>
      </div>
      {library && <div className="space-y-3 rounded-lg border border-warning p-4">
        <p className="font-medium">恢复预览 · {new Date(library.preview.created_at).toLocaleString()}</p>
        <p className="text-sm">{library.preview.projects} 部作品 · {library.preview.chapters} 章 · {library.preview.versions} 个历史版本</p>
        <p className="text-sm">恢复将替换当前全部作品。请先结束其他窗口中的编辑和 AI 任务。恢复前会自动保存当前书架的安全副本。</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />我确认用此备份替换当前书架</label>
        <Button disabled={busy || !confirmed} onClick={() => void act(async () => {
          const result = await recovery<{ safety_backup: string }>(`/restore?sha256=${library.preview.sha256}`, { method: 'POST', body: library.raw });
          setLibrary(null); setConfirmed(false);
          await client.invalidateQueries();
          toast.success(`恢复完成，原书架已保存在 ${result.safety_backup}`);
        })}>确认恢复</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setLibrary(null)}>取消</Button>
      </div>}
      {project && <div className="space-y-3 rounded-lg border p-4">
        <p className="font-medium">导入作品 · {project.preview.name}</p>
        <p className="text-sm">{project.preview.chapters} 章 · {project.preview.versions} 个历史版本 · {new Date(project.preview.created_at).toLocaleString()}</p>
        <p className="text-sm">导入会新增一部作品，不会替换或覆盖现有书架。</p>
        <Button disabled={busy} onClick={() => void act(async () => {
          const result = await recovery<{ name: string }>(`/projects/import?sha256=${project.preview.sha256}`, { method: 'POST', body: project.raw });
          setProject(null);
          await client.invalidateQueries();
          toast.success(`已导入作品「${result.name}」`);
        })}>确认导入</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setProject(null)}>取消</Button>
      </div>}
      <h3 className="text-sm font-medium">本机备份</h3>
      {backups.isLoading && <p>正在读取…</p>}
      {backups.isError && <p className="text-sm text-destructive">{backups.error.message}</p>}
      {backups.data?.length === 0 && <p className="text-sm text-muted-foreground">尚无备份</p>}
      <div className="max-h-64 space-y-2 overflow-y-auto">{backups.data?.map(item => <div key={item.name} className="flex items-center gap-2 rounded-md border p-2">
        <div className="min-w-0 flex-1"><p className="truncate text-xs" title={item.name}>{item.name}</p><p className="text-xs text-muted-foreground">{(item.size / 1024).toFixed(1)} KB</p></div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => { await saveBackup(item.name); })}>另存</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => inspect(await backupText(item.name)))}>预览恢复</Button>
      </div>)}</div>
    </DialogContent>
  </Dialog>;
}
