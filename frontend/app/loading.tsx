import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Skeleton } from "@/components/Skeleton";

export default function LandingLoading() {
  return (
    <div className="bg-water-950 text-foam-100">
      <SiteNav register="water" />
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 text-foam-400 md:grid-cols-[1.15fr_0.85fr] md:items-center md:pb-28 md:pt-24">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-6 h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-4/5" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <div className="mt-9 flex gap-4">
            <Skeleton className="h-12 w-40 rounded-full" />
            <Skeleton className="h-12 w-36 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-56 w-full rounded-lg" />
      </section>
      <SiteFooter register="water" />
    </div>
  );
}
