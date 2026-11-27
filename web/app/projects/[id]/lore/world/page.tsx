"use client";

import { use } from "react";

import { LoreLibrary } from "@/components/lore/lore-library";

export default function WorldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <LoreLibrary projectId={Number(id)} kind="world" />;
}
