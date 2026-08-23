import Link from "next/link";
import { RootMark } from "./RootMotif";

type Register = "water" | "mudflat";

const NAV_LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/verify", label: "Verify", labelFull: "Verify a credit" },
];

export function SiteNav({ register }: { register: Register }) {
  const isWater = register === "water";

  return (
    <header
      className={`sticky top-0 z-40 border-b ${
        isWater
          ? "border-water-700/60 bg-water-950/90 text-foam-100 backdrop-blur-md"
          : "border-mudflat-200 bg-mudflat-50/90 text-ink-900 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4">
        <Link href="/" className="group flex items-center gap-2 sm:gap-2.5">
          <RootMark
            className={`h-6 w-6 shrink-0 transition-transform group-hover:-translate-y-0.5 sm:h-7 sm:w-7 ${
              isWater ? "text-sand-300" : "text-teal-600"
            }`}
          />
          <span className="font-display text-base font-medium tracking-tight whitespace-nowrap sm:text-lg">
            NeelKosh
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 ${
                isWater ? "hover:bg-water-800 hover:text-sand-200" : "hover:bg-mudflat-200 hover:text-ink-900"
              }`}
            >
              <span className="sm:hidden">{link.label}</span>
              <span className="hidden sm:inline">{link.labelFull ?? link.label}</span>
            </Link>
          ))}
          <Link
            href="/register"
            className="ml-1 rounded-full bg-sand-500 px-3 py-2 text-sm font-semibold whitespace-nowrap text-water-950 transition-colors hover:bg-sand-300 sm:px-4"
          >
            <span className="sm:hidden">Register</span>
            <span className="hidden sm:inline">Register a project</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
