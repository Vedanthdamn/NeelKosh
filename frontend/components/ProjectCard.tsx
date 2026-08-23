import Link from "next/link";
import type { ProjectSummary } from "@/lib/api";
import { EcosystemBadge, StatusBadge } from "@/components/Badge";
import { polygonAreaHectares } from "@/lib/geo";
import { formatDate, formatNumber } from "@/lib/format";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const areaHectares = polygonAreaHectares(project.boundary);

  return (
    <Link
      href={`/projects/${project.projectId}`}
      className="group flex flex-col rounded-xl border border-mudflat-200 bg-mudflat-50 p-6 transition-colors hover:border-teal-500/50 hover:bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <EcosystemBadge ecosystem={project.ecosystem} />
          <StatusBadge status={project.status} />
        </div>
        <span className="font-data text-xs text-ink-500">#{project.projectId}</span>
      </div>

      <h3 className="mt-4 font-display text-xl leading-snug font-medium text-ink-900 transition-colors group-hover:text-teal-600">
        {project.name}
      </h3>

      {project.metadata?.description ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-500">{project.metadata.description}</p>
      ) : null}

      <div className="mt-6 flex items-end justify-between border-t border-mudflat-200 pt-4">
        <div>
          <p className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Area</p>
          <p className="font-data text-sm font-medium text-ink-900">{formatNumber(Math.round(areaHectares))} ha</p>
        </div>
        <div className="text-right">
          <p className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Registered</p>
          <p className="font-data text-sm font-medium text-ink-900">{formatDate(project.registeredAt)}</p>
        </div>
      </div>
    </Link>
  );
}
