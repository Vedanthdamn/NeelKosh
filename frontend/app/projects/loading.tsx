import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Skeleton } from "@/components/Skeleton";

export default function ProjectsLoading() {
  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-500">
      <SiteNav register="mudflat" />
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-8">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-10 w-72" />
        <Skeleton className="mt-4 h-4 w-full max-w-xl" />
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-mudflat-200 p-6">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-4 h-6 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <div className="mt-6 flex justify-between border-t border-mudflat-200 pt-4">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <SiteFooter register="mudflat" />
    </div>
  );
}
