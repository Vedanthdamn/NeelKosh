"use client";

import { useEffect } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ErrorState } from "@/components/ErrorState";

export default function LandingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-water-950 text-foam-100">
      <SiteNav register="water" />
      <ErrorState
        register="water"
        message="The registry's live numbers couldn't be loaded. The backend API may be unreachable."
        onRetry={reset}
      />
      <SiteFooter register="water" />
    </div>
  );
}
