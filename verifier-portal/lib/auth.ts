"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "./api";

export interface Session {
  token: string;
  user: SessionUser;
}

const STORAGE_KEY = "neelkosh-verifier-session";

/** Reads the persisted session, if any — client-only, localStorage has no server-side value. */
export function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Session state for client components. Backed by localStorage rather than a cookie — this
 * portal has no server-rendered auth-gated data (every page fetches from the backend API
 * client-side with the token attached), so there's nothing a server component needs the session
 * for. A page refresh restores the session from storage; closing the wallet extension or
 * switching accounts does not automatically sign this portal out, matching how the token itself
 * works (it proves a signature that already happened, not an ongoing wallet connection).
 */
export function useSession() {
  const [session, setSessionState] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSessionState(readStoredSession());
    setHydrated(true);
  }, []);

  const setSession = useCallback((next: Session | null) => {
    writeStoredSession(next);
    setSessionState(next);
  }, []);

  const signOut = useCallback(() => setSession(null), [setSession]);

  return { session, setSession, signOut, hydrated };
}
