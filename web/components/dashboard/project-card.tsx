"use client";

import Link from "next/link";
import { Archive, ArrowUpRight, Copy, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { exportProjectFile } from "@/lib/recovery";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/lib/types";
import { useProjectActions } from "@/lib/queries";

// 依据项目名生成稳定的封面渐变色相，让画廊富有杂志陈列感。
function coverHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return h;
}

export function ProjectCard({ project }: { project: Project }) {
  const actions = useProjectActions();
  const hue = coverHue(project.name || String(project.id));
  const initial = Array.from(project.name.trim())[0] ?? "书";

  return (
    <Link href={`/workspace/?project=${project.id}`} className="group block">
      <Card className="overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
        <div
          className="relative flex h-36 items-center justify-center"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 70% 92%), hsl(${
              (hue + 40) % 360
            } 65% 80%))`,
          }}
        >
          <span
            className="display-title text-5xl"
            style={{ color: `hsl(${hue} 60% 30%)` }}
          >
            {initial}
          </span>
          <ArrowUpRight className="absolute right-3 top-3 h-5 w-5 text-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="space-y-2 p-5">
          <h3 className="display-title text-xl leading-snug">{project.name}</h3>
          <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
            {project.description || "暂无简介"}
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground/70">
              创建于 {formatDate(project.created_at)}
            </p>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="size-7" aria-label="重命名作品" title="重命名" onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const name = window.prompt("作品名称", project.name);
                if (name?.trim() && name.trim() !== project.name) void actions.rename.mutateAsync({ projectId: project.id, name: name.trim() }).then(() => toast.success("作品已重命名")).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "重命名失败"));
              }}><Pencil className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label="复制作品" title="复制" onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void actions.duplicate.mutateAsync(project.id).then(() => toast.success("作品已复制")).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "复制失败"));
              }}><Copy className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label="归档作品" title="归档" onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (window.confirm(`归档「${project.name}」？归档后可从恢复入口找回。`)) void actions.archive.mutateAsync({ projectId: project.id, archived: true }).then(() => toast.success("作品已归档")).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "归档失败"));
              }}><Archive className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void exportProjectFile(project.id).then(() => toast.success("作品已导出")).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "导出失败"));
              }}>导出</Button>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
