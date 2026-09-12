import { apiHeaders, getApiBase } from './api';

export async function recovery<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}/recovery${path}`, { ...init, headers: { ...(await apiHeaders()), ...init?.headers } });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || `操作失败 (${res.status})`);
  }
  return res.json();
}

export async function backupText(name: string) {
  const res = await fetch(`${getApiBase()}/recovery/backups/${encodeURIComponent(name)}`, { headers: await apiHeaders() });
  if (!res.ok) throw new Error('无法读取备份');
  return res.text();
}

export async function saveFile(name: string, content: string) {
  if ('__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<boolean>('save_backup_file', { name, content });
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

export async function saveBackup(name: string) {
  return saveFile(name, await backupText(name));
}

export async function exportProjectFile(projectId: number) {
  const res = await fetch(`${getApiBase()}/recovery/projects/${projectId}/export`, { headers: await apiHeaders() });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || '无法导出作品');
  }
  const content = await res.text();
  const payload = JSON.parse(content);
  const name = `${payload.tables?.projects?.[0]?.name || `project-${projectId}`}.novelhub-project`;
  return saveFile(name, content);
}
