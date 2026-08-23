import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Skeleton } from "@/components/Skeleton";

export default function VerifyLandingLoading() {
  return (
    <div className="min-h-screen bg-water-950 text-foam-400">
      <SiteNav register="water" />
      <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-5 h-11 w-full" />
        <Skeleton className="mt-3 h-11 w-2/3" />
        <Skeleton className="mt-5 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
        <div className="mt-10 flex w-full gap-3">
          <Skeleton className="h-14 flex-1 rounded-lg" />
          <Skeleton className="h-14 w-28 rounded-lg" />
        </div>
      </div>
      <SiteFooter register="water" />
    </div>
  );
}
