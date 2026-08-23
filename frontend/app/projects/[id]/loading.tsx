import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Skeleton } from "@/components/Skeleton";

export default function ProjectDetailLoading() {
  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-500">
      <SiteNav register="mudflat" />

      <section className="mx-auto max-w-6xl px-6 pt-12 pb-8">
        <Skeleton className="h-4 w-24" />
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-9 w-96" />

        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2 h-5 w-24" />
            </div>
          ))}
        </div>

        <Skeleton className="mt-6 h-16 w-full max-w-3xl" />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-[380px] w-full rounded-xl" />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-6 h-[320px] w-full rounded-xl" />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      </section>

      <SiteFooter register="mudflat" />
    </div>
  );
}
