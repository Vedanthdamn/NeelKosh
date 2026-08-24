import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ListingCard } from "@/components/ListingCard";
import { RootMark } from "@/components/RootMotif";
import { fetchListings } from "@/lib/api";

export const metadata = { title: "Marketplace · NeelKosh" };

export default async function MarketplacePage() {
  const listings = await fetchListings();

  return (
    <div className="min-h-screen bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />

      <section className="mx-auto max-w-6xl px-6 pt-14 pb-8">
        <p className="font-data text-xs uppercase tracking-[0.2em] text-teal-600">Marketplace</p>
        <h1 className="mt-3 font-display text-4xl font-medium sm:text-5xl">Buy verified blue carbon credits</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">
          Every listing below is credits an implementing organisation already holds, issued
          against an independently approved MRV claim. See any project&rsquo;s page for the full
          chain of custody behind it.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        {listings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-mudflat-200 py-20 text-center">
            <RootMark className="h-10 w-10 text-teal-500" />
            <div>
              <p className="font-display text-xl font-medium text-ink-900">No credits listed right now</p>
              <p className="mt-1 text-sm text-ink-500">Check back once an implementing organisation lists a batch.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.listingId} listing={listing} />
            ))}
          </div>
        )}
      </section>

      <SiteFooter register="mudflat" />
    </div>
  );
}
