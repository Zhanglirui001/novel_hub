"use client";

import { cn } from "@/lib/utils";

function scoreColor(score: number): string {
  if (score >= 85) return "hsl(var(--success))";
  if (score >= 60) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "一致性良好";
  if (score >= 60) return "需关注";
  return "存在冲突";
}

export function ConsistencyRing({
  score,
  size = 132,
  className,
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color = scoreColor(clamped);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.3s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="display-title text-3xl" style={{ color }}>
            {clamped}
          </span>
          <span className="text-[0.7rem] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-medium" style={{ color }}>
        {scoreLabel(clamped)}
      </span>
    </div>
  );
}
