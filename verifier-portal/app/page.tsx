"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";

export default function RootPage() {
  const { session, hydrated } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(session ? "/queue" : "/login");
  }, [hydrated, session, router]);

  return null;
}
