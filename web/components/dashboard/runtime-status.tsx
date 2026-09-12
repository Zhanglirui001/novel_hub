"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function RuntimeStatus() {
  const [elapsed, setElapsed] = useState(0);
  const health = useQuery({
    queryKey: ["runtime-health"],
    queryFn: api.health,
    refetchInterval: 15_000,
    retry: 8,
    retryDelay: 500,
  });
  useEffect(() => {
    if (health.data?.status === "ok") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [health.data?.status]);
  const online = health.data?.status === "ok";
  const timedOut = !online && elapsed >= 15;
  const errorText = health.error instanceof Error ? health.error.message : "未收到本地服务响应";
  const exportDiagnostics = async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("export_diagnostics", {
      content: [
        `时间：${new Date().toISOString()}`,
        `服务状态：${online ? "ok" : "offline"}`,
        `错误：${errorText}`,
        `页面地址：${window.location.href}`,
        `用户代理：${navigator.userAgent}`,
      ].join("\n"),
    });
  };
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-medium">
        <span className={`size-2 rounded-full ${online ? "bg-success" : health.isError ? "bg-destructive" : "animate-pulse bg-warning"}`} />
        {online ? "本地服务已连接" : timedOut ? "本地服务启动超时" : health.isError ? "本地服务未连接" : "正在启动本地服务"}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">{online ? "SQLite · 作品与对话存储在此设备" : timedOut ? errorText : "FastAPI sidecar 正在初始化"}</p>
      {timedOut ? (
        <div className="mt-2 flex gap-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => { setElapsed(0); void health.refetch(); }}>重试</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => void exportDiagnostics()}>导出诊断</Button>
        </div>
      ) : null}
    </div>
  );
}
