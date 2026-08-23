import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ProjectCard } from "@/components/ProjectCard";
import { RootMark } from "@/components/RootMotif";
import { fetchProjects } from "@/lib/api";

export const metadata = { title: "Projects — NeelKosh" };

export default async function ProjectsPage() {
  const projects = await fetchProjects();

  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />

      <section className="mx-auto max-w-6xl px-6 pt-14 pb-8">
        <p className="font-data text-xs uppercase tracking-[0.2em] text-teal-600">The registry</p>
        <h1 className="mt-3 font-display text-4xl font-medium sm:text-5xl">Restoration projects</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">
          Every project below is registered on chain, with an accountable implementing
          organisation and a boundary anyone can check against a map.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-mudflat-200 py-20 text-center">
            <RootMark className="h-10 w-10 text-teal-500" />
            <div>
              <p className="font-display text-xl font-medium text-ink-900">No projects registered yet</p>
              <p className="mt-1 text-sm text-ink-500">Be the first to put a restoration site on the record.</p>
            </div>
            <Link
              href="/register"
              className="mt-2 rounded-full bg-water-900 px-6 py-3 text-sm font-semibold text-mudflat-50 transition-colors hover:bg-water-700"
            >
              Register a project
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.projectId} project={project} />
            ))}
          </div>
        )}
      </section>

      <SiteFooter register="mudflat" />
    </div>
  );
}
