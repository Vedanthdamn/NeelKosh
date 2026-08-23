"use client";

import { useEffect } from "react";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ErrorState } from "@/components/ErrorState";

export default function ProjectDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-mudflat-50 text-ink-900">
      <SiteNav register="mudflat" />
      <ErrorState
        register="mudflat"
        message="This project couldn't be loaded. The backend API may be unreachable."
        onRetry={reset}
        homeHref="/projects"
        homeLabel="All projects"
      />
      <SiteFooter register="mudflat" />
    </div>
  );
}
