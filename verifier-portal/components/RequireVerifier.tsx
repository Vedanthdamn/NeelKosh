"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";

/**
 * Route guard for every authenticated page. Renders nothing (and redirects to /login) until a
 * VERIFIER session is confirmed present — `hydrated` gates this on the one render tick where
 * localStorage hasn't been read yet, so a signed-in verifier refreshing the page never flashes
 * a redirect before their session loads.
 */
export function RequireVerifier({ children }: { children: React.ReactNode }) {
  const { session, hydrated } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  if (!hydrated || !session) return null;
  return <>{children}</>;
}
