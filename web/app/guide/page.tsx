"use client";

import { useState } from "react";
import Link from "next/link";
import { AtSign, Check, Copy, Layers, Sparkles, Workflow, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODES = [
  {
    icon: Zap,
    title: "单个唤醒",
    form: "口令：内容",
    example: "研讨：林晚的执念线怎么铺？",
    note: "最常用，一句话叫醒一个 agent。",
    tint: "bg-blue-500/10 text-blue-600",
  },
  {
    icon: Layers,
    title: "并行唤醒",
    form: "A + B：任务",
    example: "研讨 + 人物：林晚的性格与执念，各给一个版本",
    note: "lead 同时派发，再合并结果。",
    tint: "bg-violet-500/10 text-violet-600",
  },
  {
    icon: Workflow,
    title: "流水线",
    form: "走流程：任务",
    example: "走流程：以「失去双亲的太空探险家」为核心，出一版开场",
    note: "灵感 → 世界观/人物 → 剧情 → 节奏 → 心法 → 写作 → 审查。",
    tint: "bg-amber-500/10 text-amber-600",
  },
  {
    icon: AtSign,
    title: "@ 点名",
    form: "@名字 内容",
    example: "@写作 写一个 300 字开场（中英文皆可：@写作 / @writer）",
    note: "直接指定 agent，跳过口令解析。",
    tint: "bg-teal-500/10 text-teal-600",
  },
];

const AGENTS = [
  { name: "灵感收集", cmd: "灵感：", desc: "捕捉、归档、提炼灵感", dot: "bg-teal-500" },
  { name: "世界观", cmd: "世界观：", desc: "世界观设定与自洽", dot: "bg-indigo-500" },
  { name: "人物刻画", cmd: "人物：", desc: "人物卡、动机、关系、OOC", dot: "bg-indigo-500" },
  { name: "剧情研讨", cmd: "研讨：", desc: "剧情决策、多方案对比", dot: "bg-indigo-500" },
  { name: "节奏编排", cmd: "节奏：", desc: "叙事顺序、节奏曲线、拆场景", dot: "bg-indigo-500" },
  { name: "写作心法", cmd: "心法：", desc: "跨项目通用写作方法", dot: "bg-violet-500" },
  { name: "写作", cmd: "写：", desc: "执笔产出正文初稿", dot: "bg-amber-500" },
  { name: "读者体验审查", cmd: "审稿：", desc: "读者视角审稿 + 改法", dot: "bg-rose-500" },
];

const QUICK = [
  { cmd: "灵感：<内容>", desc: "记一条灵感进灵感池" },
  { cmd: "埋线：<内容>", desc: "登记一条伏笔" },
  { cmd: "查矛盾", desc: "扫描设定 / 正文，找冲突" },
  { cmd: "排章节", desc: "打开编排表重排顺序" },
  { cmd: "三个选项", desc: "给 3 个方向 + 利弊" },
  { cmd: "回流", desc: "把结论沉淀到对应层" },
  { cmd: "查阅使用手册", desc: "调出完整操作手册" },
];

const EXAMPLES = [
  { label: "灵感", text: "灵感：林晚在父母的旧飞船里发现一段没走完的航线记录" },
  { label: "人物", text: "人物：林晚失去双亲后，为什么还要上太空？给三个动机版本" },
  { label: "世界观", text: "世界观：太空探险时代，民用飞船的补给与求救规则是什么？" },
  { label: "剧情", text: "研讨：林晚的执念线怎么铺？给两个方向" },
  { label: "节奏", text: "节奏：把「发现旧航线」拆成 3 个场景并排序" },
  { label: "写作", text: "写：按林晚的设定，写一个 300 字开头" },
];

const FLOW = [
  "你输入口令 → lead 解析出「哪个 agent + 什么任务」",
  "lead 用 subagent（新起）或 send_message（续用）派发",
  "agent 在独立上下文里干活，结果回流给 lead 汇总",
  "雷达页底部「最近派发」会实时显示这些派发记录",
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="复制"
      title="一键复制"
      className={cn(
        "shrink-0 rounded-md border p-1.5 text-muted-foreground transition hover:border-primary/40 hover:text-primary",
        copied && "border-emerald-300 text-emerald-600",
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">← 返回</Link>
        </Button>
      </div>

      {/* Hero */}
      <div className="relative mb-10 overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-background p-8 sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3" /> 8 个 agent · 4 种唤醒方式
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">快速上手</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            在对话框输入口令，lead 会解析并派发给对应 agent。下面从「一句话」到「整条流水线」，按复杂度递增。
          </p>
        </div>
      </div>

      {/* 四种触发方式 */}
      <section className="mb-12">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">一、四种触发方式</h2>
          <span className="text-xs text-muted-foreground">从简单到复杂</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {MODES.map((m) => (
            <div
              key={m.title}
              className="group rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", m.tint)}>
                  <m.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{m.title}</div>
                  <code className="text-[11px] text-muted-foreground">{m.form}</code>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-muted/70 px-3 py-2 text-xs leading-relaxed">{m.example}</div>
              <p className="mt-2.5 text-[11px] text-muted-foreground">{m.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* agent 速查 */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">二、8 个 agent 口令速查</h2>
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">agent</th>
                <th className="px-4 py-2.5 font-medium">口令</th>
                <th className="px-4 py-2.5 font-medium">职责</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS.map((a) => (
                <tr key={a.name} className="border-t transition hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", a.dot)} />
                      {a.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{a.cmd}</code>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 轻量口令 */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">三、工作台轻量口令</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK.map((q) => (
            <div key={q.cmd} className="rounded-xl border bg-card p-3.5 transition hover:border-primary/40">
              <code className="text-xs font-medium">{q.cmd}</code>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{q.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 示例 */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold">四、直接可抄的示例</h2>
        <div className="space-y-2.5">
          {EXAMPLES.map((e) => (
            <div
              key={e.label}
              className="flex items-start gap-3 rounded-xl border bg-card p-3.5 transition hover:border-primary/40"
            >
              <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {e.label}
              </span>
              <code className="flex-1 text-xs leading-relaxed">{e.text}</code>
              <CopyButton text={e.text} />
            </div>
          ))}
        </div>
      </section>

      {/* 机制 */}
      <section className="mb-4">
        <h2 className="mb-4 text-lg font-semibold">五、背后是怎么走的</h2>
        <div className="space-y-3">
          {FLOW.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <p className="pt-0.5 text-sm text-muted-foreground">{step}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
