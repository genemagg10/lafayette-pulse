import ProjectsArchive from "../../components/ProjectsArchive";

export default function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  return <ProjectsArchive initialId={Number.isFinite(id) ? id : undefined} />;
}
