"use client";

import Link from "next/link";
import { RootMark } from "./RootMotif";

type Register = "water" | "mudflat";

interface ErrorStateProps {
  register: Register;
  message?: string;
  onRetry: () => void;
  homeHref?: string;
  homeLabel?: string;
}

/**
 * The shared shape behind every route's error.tsx. A live demo's worst failure mode is a blank
 * screen or an unstyled Next.js crash page when the backend hiccups — this always explains what
 * happened, in the interface's voice, with a way back to something that works.
 */
export function ErrorState({
  register,
  message = "That didn't load. The backend API may be unreachable.",
  onRetry,
  homeHref = "/",
  homeLabel = "Back to home",
}: ErrorStateProps) {
  const isWater = register === "water";

  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center ${isWater ? "text-foam-100" : "text-ink-900"}`}>
      <RootMark className={`h-9 w-9 ${isWater ? "text-sand-300" : "text-teal-500"}`} />
      <h1 className="font-display text-2xl font-medium">Something went wrong</h1>
      <p className={`max-w-sm text-sm ${isWater ? "text-foam-300" : "text-ink-500"}`}>{message}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-sand-500 px-6 py-2.5 text-sm font-semibold text-water-950 transition-colors hover:bg-sand-300"
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className={`rounded-full border px-6 py-2.5 text-sm font-semibold transition-colors ${
            isWater ? "border-foam-400/40 hover:border-sand-300 hover:text-sand-200" : "border-mudflat-200 hover:bg-mudflat-200"
          }`}
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
