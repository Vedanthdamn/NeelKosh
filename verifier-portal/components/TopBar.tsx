"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { truncateAddress } from "@/lib/format";

const NAV_LINKS = [
  { href: "/queue", label: "Queue" },
  { href: "/history", label: "History" },
];

/** Session-aware header for every authenticated page. Not rendered on /login. */
export function TopBar() {
  const { session, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  function handleSignOut() {
    signOut();
    router.push("/login");
  }

  return (
    <header className="border-b border-slate-700 bg-slate-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/queue" className="font-data text-sm font-semibold tracking-tight text-slate-100">
            NeelKosh <span className="text-accent-400">Verifier</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {session ? (
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-xs font-medium text-slate-200">{session.user.organizationName || "Verifier"}</p>
              <p className="font-data text-[11px] text-slate-500">{truncateAddress(session.user.walletAddress)}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
