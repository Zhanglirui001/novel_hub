"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/lib/types";

// 依据项目名生成稳定的封面渐变色相，让画廊富有杂志陈列感。
function coverHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return h;
}

export function ProjectCard({ project }: { project: Project }) {
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
          <p className="pt-1 text-xs text-muted-foreground/70">
            创建于 {formatDate(project.created_at)}
          </p>
        </div>
      </Card>
    </Link>
  );
}
