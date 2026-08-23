"use client";

import { useEffect } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ErrorState } from "@/components/ErrorState";

export default function ProjectsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />
      <ErrorState
        register="mudflat"
        message="The project list couldn't be loaded. The backend API may be unreachable."
        onRetry={reset}
      />
      <SiteFooter register="mudflat" />
    </div>
  );
}
