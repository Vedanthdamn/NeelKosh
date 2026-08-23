"use client";

import { useEffect } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ErrorState } from "@/components/ErrorState";
import { TokenSearchBar } from "@/components/TokenSearchBar";

export default function VerifyResultError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-water-950 text-foam-100">
      <SiteNav register="water" />
      <div className="mx-auto w-full max-w-xl px-6 pt-14">
        <TokenSearchBar />
      </div>
      <ErrorState
        register="water"
        message="This credit couldn't be looked up. The backend API may be unreachable."
        onRetry={reset}
        homeHref="/verify"
        homeLabel="Search again"
      />
      <SiteFooter register="water" />
    </div>
  );
}
