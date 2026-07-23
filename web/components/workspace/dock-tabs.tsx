"use client";

import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Drama,
  FileText,
  Files,
  Layers,
  MessageSquare,
  PenLine,
  ScrollText,
  ShieldCheck,
  Waypoints,
} from "lucide-react";

import { ChatPanel } from "./chat-panel";
import { ConsistencyPanel } from "./consistency-panel";
import { GenerationPanel } from "./generation-panel";
import { InlineRevisePanel } from "./inline-revise-panel";
import { LorePanel } from "./lore-panel";
import { PatchReview } from "./patch-review";
import { PlotDiscussionPanel } from "./plot-discussion-panel";
import { StorylinePanel } from "./storyline-panel";
import { StylePanel } from "./style-panel";
import { TimelinePanel } from "./timeline-panel";

export type DockTab = {
  value: string;
  label: string;
  icon: LucideIcon;
  /** 面板组件；接收可选的 fullscreen 布局标记。 */
  Panel: React.ComponentType<{ fullscreen?: boolean }>;
  /** 全屏时铺满对话框（不套限宽滚动容器），适合画布类面板。 */
  fullBleed?: boolean;
};

/** 右侧助手栏的功能面板注册表。dock 与全屏容器共用，保证一致。 */
export const DOCK_TABS: DockTab[] = [
  { value: "chat", label: "聊天", icon: MessageSquare, Panel: ChatPanel, fullBleed: true },
  { value: "create", label: "创作", icon: PenLine, Panel: GenerationPanel },
  { value: "plot", label: "剧情", icon: Drama, Panel: PlotDiscussionPanel },
  { value: "revise", label: "版本", icon: Files, Panel: InlineRevisePanel },
  { value: "consistency", label: "一致性", icon: ShieldCheck, Panel: ConsistencyPanel },
  { value: "patch", label: "修改", icon: Layers, Panel: PatchReview },
  { value: "lore", label: "设定", icon: ScrollText, Panel: LorePanel },
  { value: "style", label: "文风", icon: FileText, Panel: StylePanel },
  { value: "timeline", label: "时间线", icon: Clock, Panel: TimelinePanel },
  { value: "storyline", label: "故事线", icon: Waypoints, Panel: StorylinePanel, fullBleed: true },
];

export function getDockTab(value: string | null): DockTab | undefined {
  if (value == null) return undefined;
  return DOCK_TABS.find((t) => t.value === value);
}
