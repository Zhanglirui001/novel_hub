import { notFound } from "next/navigation";

import { InspirationStudio } from "@/components/inspiration/inspiration-studio";
import { api } from "@/lib/api";

export default async function InspirationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isFinite(projectId)) notFound();

  try {
    const project = await api.getProject(projectId);
    return <InspirationStudio projectId={project.id} projectTitle={project.name} />;
  } catch {
    notFound();
  }
}
