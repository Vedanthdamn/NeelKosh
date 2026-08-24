"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";

/**
 * Route guard for every authenticated page. Renders nothing (and redirects to /login) until a
 * VERIFIER session is confirmed present — `hydrated` gates this on the one render tick where
 * localStorage hasn't been read yet, so a signed-in verifier refreshing the page never flashes
 * a redirect before their session loads.
 *
 * Checks the role, not just that a session exists: the login page only ever stores a session for
 * a wallet that verified as VERIFIER, so this can't normally be reached any other way — but this
 * is the one place client-side that actually says so, rather than silently rendering an empty
 * shell for whatever session happens to be in localStorage and leaving "is this actually a
 * verifier" entirely to the backend's 403s underneath it. The backend's own requireRole checks on
 * every endpoint remain the real boundary regardless of what this component does.
 */
export function RequireVerifier({ children }: { children: React.ReactNode }) {
  const { session, hydrated, signOut } = useSession();
  const router = useRouter();
  const authorized = !!session && session.user.role === "VERIFIER";

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.user.role !== "VERIFIER") {
      signOut();
      router.replace("/login");
    }
  }, [hydrated, session, router, signOut]);

  if (!hydrated || !authorized) return null;
  return <>{children}</>;
}
