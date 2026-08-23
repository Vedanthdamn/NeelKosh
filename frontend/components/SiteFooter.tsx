import Link from "next/link";
import { RootMark } from "./RootMotif";

type Register = "water" | "mudflat";

export function SiteFooter({ register }: { register: Register }) {
  const isWater = register === "water";

  return (
    <footer
      className={`border-t ${
        isWater ? "border-water-700/60 bg-water-950 text-foam-200" : "border-mudflat-200 bg-mudflat-50 text-ink-700"
      }`}
    >
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <RootMark className={`h-5 w-5 ${isWater ? "text-sand-300" : "text-teal-600"}`} />
              <span className="font-display text-base font-medium">NeelKosh</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed">
              A blue carbon registry where every credit&rsquo;s chain of custody — from satellite reading
              to retirement — is on chain and independently checkable.
            </p>
          </div>

          <nav className="flex gap-10 text-sm">
            <div className="flex flex-col gap-2">
              <span className={`font-data text-xs uppercase tracking-wider ${isWater ? "text-foam-400" : "text-ink-500"}`}>
                Registry
              </span>
              <Link href="/projects" className="hover:underline">
                Projects
              </Link>
              <Link href="/register" className="hover:underline">
                Register a project
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className={`font-data text-xs uppercase tracking-wider ${isWater ? "text-foam-400" : "text-ink-500"}`}>
                Trust
              </span>
              <Link href="/verify" className="hover:underline">
                Verify a credit
              </Link>
            </div>
          </nav>
        </div>

        <p className={`mt-10 border-t pt-6 text-xs ${isWater ? "border-water-800 text-foam-400" : "border-mudflat-200 text-ink-500"}`}>
          Prototype built for Smart India Hackathon. This instance runs against a local demo chain — the
          data shown is illustrative, not a live production registry.
        </p>
      </div>
    </footer>
  );
}
