import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Skeleton } from "@/components/Skeleton";

export default function VerifyResultLoading() {
  return (
    <div className="min-h-screen bg-water-950 text-foam-400">
      <SiteNav register="water" />

      <section className="mx-auto max-w-4xl px-6 pt-14 pb-6">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="mt-10 h-3 w-28" />
        <Skeleton className="mt-2 h-9 w-72" />
        <Skeleton className="mt-2 h-4 w-96" />
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10">
        <Skeleton className="h-64 w-full rounded-xl" />
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-10">
        <Skeleton className="h-24 w-full rounded-xl" />
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-6 h-48 w-full rounded-xl" />
      </section>

      <SiteFooter register="water" />
    </div>
  );
}
