"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function RuntimeStatus() {
  const health = useQuery({
    queryKey: ["runtime-health"],
    queryFn: api.health,
    refetchInterval: 15_000,
    retry: 8,
    retryDelay: 500,
  });
  const online = health.data?.status === "ok";
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
        <span className={`size-2 rounded-full ${online ? "bg-success" : health.isError ? "bg-destructive" : "animate-pulse bg-warning"}`} />
        {online ? "本地服务已连接" : health.isError ? "本地服务未连接" : "正在启动本地服务"}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">{online ? "SQLite · 作品与对话存储在此设备" : "FastAPI sidecar 正在初始化"}</p>
    </div>
  );
}
