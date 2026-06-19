"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useLlmSettings,
  useTestLlmSettings,
  useUpdateLlmSettings,
} from "@/lib/queries";
import type { LlmProvider, LlmSettingsPayload } from "@/lib/types";

const PROVIDER_OPTIONS: { value: LlmProvider; label: string; hint: string }[] = [
  {
    value: "qwen",
    label: "通义千问 (DashScope)",
    hint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    value: "openai-compatible",
    label: "OpenAI 兼容端点",
    hint: "任何提供 /chat/completions 的服务",
  },
  {
    value: "stub",
    label: "启发式 Stub（不调真实模型）",
    hint: "本地占位，用于离线开发和演示",
  },
];

const DEFAULT_FORM: LlmSettingsPayload = {
  provider: "qwen",
  base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  api_key: "",
  writer_model: "qwen-plus",
  planner_model: "qwen-plus",
  judge_model: "qwen-plus",
};

export default function SettingsPage() {
  const settingsQuery = useLlmSettings();
  const update = useUpdateLlmSettings();
  const test = useTestLlmSettings();
  const [form, setForm] = React.useState<LlmSettingsPayload>(DEFAULT_FORM);

  // 服务端配置回填到表单。api_key 不下发原文，输入框留空表示「保留已存值」。
  React.useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setForm({
      provider: data.provider,
      base_url: data.base_url || DEFAULT_FORM.base_url,
      api_key: "",
      writer_model: data.writer_model || DEFAULT_FORM.writer_model,
      planner_model: data.planner_model || DEFAULT_FORM.planner_model,
      judge_model: data.judge_model || DEFAULT_FORM.judge_model,
    });
  }, [settingsQuery.data]);

  function patch<K extends keyof LlmSettingsPayload>(key: K, value: LlmSettingsPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    try {
      await update.mutateAsync(form);
      toast.success("配置已保存");
      setForm((prev) => ({ ...prev, api_key: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function handleTest() {
    try {
      const res = await test.mutateAsync(form);
      if (res.ok) toast.success(res.message || "连接成功");
      else toast.error(res.message || "连接失败");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "测试失败");
    }
  }

  const apiKeyPlaceholder = settingsQuery.data?.api_key_set
    ? `已保存：${settingsQuery.data.api_key_masked}（留空表示沿用）`
    : "粘贴 API Key";

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
        <header className="mb-10 flex items-end justify-between gap-6">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
              Novel Hub · 配置
            </p>
            <h1 className="display-title text-3xl leading-tight sm:text-4xl">
              大模型 API 配置
            </h1>
            <p className="max-w-xl text-muted-foreground">
              配置写作 / 规划 / 审校三个角色使用的模型。配置保存后，下一次续写或润色立即生效。
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              返回书架
            </Link>
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>模型服务</CardTitle>
            <CardDescription>
              选择一个 OpenAI 兼容服务并填写 Base URL 与 API Key。Stub 模式不调外部接口，便于离线试用。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settingsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在读取配置…
              </div>
            ) : (
              <div className="grid gap-5">
                <div className="grid gap-2">
                  <Label>服务商</Label>
                  <Select
                    value={form.provider}
                    onValueChange={(value) => patch("provider", value as LlmProvider)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择服务商" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col">
                            <span>{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.hint}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="base_url">Base URL</Label>
                  <Input
                    id="base_url"
                    value={form.base_url}
                    onChange={(e) => patch("base_url", e.target.value)}
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    disabled={form.provider === "stub"}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="api_key">API Key</Label>
                  <Input
                    id="api_key"
                    type="password"
                    autoComplete="off"
                    value={form.api_key}
                    onChange={(e) => patch("api_key", e.target.value)}
                    placeholder={apiKeyPlaceholder}
                    disabled={form.provider === "stub"}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="writer_model">Writer 模型</Label>
                    <Input
                      id="writer_model"
                      value={form.writer_model}
                      onChange={(e) => patch("writer_model", e.target.value)}
                      placeholder="qwen-plus"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="planner_model">Planner 模型</Label>
                    <Input
                      id="planner_model"
                      value={form.planner_model}
                      onChange={(e) => patch("planner_model", e.target.value)}
                      placeholder="qwen-plus"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="judge_model">Judge 模型</Label>
                    <Input
                      id="judge_model"
                      value={form.judge_model}
                      onChange={(e) => patch("judge_model", e.target.value)}
                      placeholder="qwen-plus"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button onClick={handleSave} disabled={update.isPending}>
                    {update.isPending ? "保存中…" : "保存配置"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={test.isPending || form.provider === "stub"}
                  >
                    {test.isPending ? "测试中…" : "测试连接"}
                  </Button>
                  {settingsQuery.data?.updated_at && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      最近更新：{settingsQuery.data.updated_at}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
