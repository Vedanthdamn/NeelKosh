import Link from "next/link";
import type { MarketplaceListing } from "@/lib/api";
import { EcosystemBadge } from "@/components/Badge";
import { boundaryCentroid } from "@/lib/geo";
import { formatNKR, formatTonnes } from "@/lib/format";

function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export function ListingCard({ listing }: { listing: MarketplaceListing }) {
  const location = listing.project && listing.project.boundary.length >= 3 ? boundaryCentroid(listing.project.boundary) : null;

  return (
    <div className="flex flex-col rounded-xl border border-mudflat-200 bg-mudflat-50 p-6">
      <div className="flex items-start justify-between gap-3">
        {listing.project ? <EcosystemBadge ecosystem={listing.project.ecosystem} /> : null}
        <span className="font-data text-xs text-ink-500">listing #{listing.listingId}</span>
      </div>

      {listing.project ? (
        <Link href={`/projects/${listing.project.projectId}`} className="mt-4 block group">
          <h3 className="font-display text-xl leading-snug font-medium text-ink-900 transition-colors group-hover:text-teal-600">
            {listing.project.name}
          </h3>
        </Link>
      ) : (
        <h3 className="mt-4 font-display text-xl leading-snug font-medium text-ink-900">Project #{listing.projectId}</h3>
      )}

      {location ? (
        <p className="font-data mt-1 text-xs text-ink-500">{formatLatLng(location.lat, location.lng)}</p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-mudflat-200 pt-4">
        <div>
          <p className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Available</p>
          <p className="font-data text-sm font-medium text-ink-900">{formatTonnes(listing.amount)}</p>
        </div>
        <div className="text-right">
          <p className="font-data text-[11px] tracking-wide text-ink-500 uppercase">Price per tonne</p>
          <p className="font-data text-sm font-medium text-ink-900">{formatNKR(listing.pricePerTonne)}</p>
        </div>
      </div>

      <Link
        href={`/marketplace/${listing.listingId}`}
        className="mt-5 rounded-full bg-water-900 px-5 py-2.5 text-center text-sm font-semibold text-mudflat-50 transition-colors hover:bg-water-700"
      >
        Buy credits
      </Link>
    </div>
  );
}
