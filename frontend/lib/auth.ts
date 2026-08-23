"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "./api";

export interface Session {
  token: string;
  user: SessionUser;
}

const STORAGE_KEY = "neelkosh-session";

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

/** Session state for client components, backed by localStorage — see verifier-portal/lib/auth.ts
 *  for the same pattern and the reasoning behind it. */
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
