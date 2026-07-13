"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { InspirationCard } from "@/lib/types";

const colorClasses: Record<string, string> = {
  amber: "border-amber-400/70 bg-amber-50",
  rose: "border-rose-400/70 bg-rose-50",
  sky: "border-sky-400/70 bg-sky-50",
  emerald: "border-emerald-400/70 bg-emerald-50",
  violet: "border-violet-400/70 bg-violet-50",
};

function NodeHandles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-zinc-600" />
      <Handle type="source" position={Position.Right} className="!bg-zinc-600" />
      <Handle type="target" position={Position.Top} className="!bg-zinc-600" />
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600" />
    </>
  );
}

export function InspirationCardNode({ data, selected }: NodeProps) {
  const card = data.card as InspirationCard | undefined;
  const annotation = data.annotation as string | undefined;
  const color = (card?.color || "amber").toLowerCase();

  if (!card) {
    return (
      <div className={`min-w-48 max-w-72 border p-3 text-sm shadow-sm ${selected ? "border-teal-600 ring-2 ring-teal-200" : "border-zinc-300"} bg-white`}>
        <NodeHandles />
        <p className="whitespace-pre-wrap text-zinc-700">{annotation || "注释"}</p>
      </div>
    );
  }

  return (
    <div className={`w-60 border p-3 shadow-sm ${colorClasses[color] || colorClasses.amber} ${selected ? "ring-2 ring-teal-500" : ""}`}>
      <NodeHandles />
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{card.card_type}</span>
        {card.origin === "ai" ? <span className="text-[11px] text-teal-700">AI</span> : null}
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{card.title}</p>
      {card.content ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{card.content}</p> : null}
      {card.tags.length ? <p className="mt-2 line-clamp-1 text-[11px] text-zinc-500">#{card.tags.join(" #")}</p> : null}
    </div>
  );
}

export function QuickNode({ data, selected }: NodeProps) {
  const title = typeof data.title === "string" ? data.title : "未命名节点";
  const content = typeof data.content === "string" ? data.content : "";
  const type = data.nodeType === "character" ? "角色" : data.nodeType === "event" ? "事件" : "注释";
  const tone = data.nodeType === "character" ? "border-sky-400/70 bg-sky-50" : data.nodeType === "event" ? "border-violet-400/70 bg-violet-50" : "border-zinc-300 bg-white";

  return (
    <div className={`min-w-40 max-w-60 border p-3 shadow-sm ${tone} ${selected ? "ring-2 ring-teal-500" : ""}`}>
      <NodeHandles />
      <p className="text-[11px] font-semibold uppercase text-zinc-500">{type}</p>
      <p className="mt-1 break-words text-sm font-semibold text-zinc-900">{title}</p>
      {content ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{content}</p> : null}
    </div>
  );
}
