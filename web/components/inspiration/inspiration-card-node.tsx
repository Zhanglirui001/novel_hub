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

export function InspirationCardNode({ data, selected }: NodeProps) {
  const card = data.card as InspirationCard | undefined;
  const annotation = data.annotation as string | undefined;
  const color = (card?.color || "amber").toLowerCase();

  if (!card) {
    return (
      <div className={`min-w-48 max-w-72 border p-3 text-sm shadow-sm ${selected ? "border-teal-600 ring-2 ring-teal-200" : "border-zinc-300"} bg-white`}>
        <Handle type="target" position={Position.Left} className="!bg-zinc-500" />
        <p className="whitespace-pre-wrap text-zinc-700">{annotation || "注释"}</p>
        <Handle type="source" position={Position.Right} className="!bg-zinc-500" />
      </div>
    );
  }

  return (
    <div className={`w-60 border p-3 shadow-sm ${colorClasses[color] || colorClasses.amber} ${selected ? "ring-2 ring-teal-500" : ""}`}>
      <Handle type="target" position={Position.Left} className="!bg-zinc-600" />
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{card.card_type}</span>
        {card.origin === "ai" ? <span className="text-[11px] text-teal-700">AI</span> : null}
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{card.title}</p>
      {card.content ? <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{card.content}</p> : null}
      {card.tags.length ? <p className="mt-2 line-clamp-1 text-[11px] text-zinc-500">#{card.tags.join(" #")}</p> : null}
      <Handle type="source" position={Position.Right} className="!bg-zinc-600" />
    </div>
  );
}
