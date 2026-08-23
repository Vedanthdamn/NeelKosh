import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { RootMotif } from "@/components/RootMotif";
import { RegistryLedger } from "@/components/RegistryLedger";
import { fetchRegistryStats } from "@/lib/api";

const PIPELINE = [
  {
    number: "01",
    title: "Register",
    body: "An implementing organisation registers a restoration site on chain: its boundary, its ecosystem, who's accountable for it.",
  },
  {
    number: "02",
    title: "Submit",
    body: "Field and satellite data become a hashed MRV report — the exact evidence a claim rests on, fingerprinted and timestamped.",
  },
  {
    number: "03",
    title: "Verify",
    body: "An accredited verifier reviews the claim independently and signs their approval. Their name is attached to the decision, permanently.",
  },
  {
    number: "04",
    title: "Mint & retire",
    body: "Only an approved claim can mint credits — for the exact tonnage the verifier signed off on. Retiring one burns it: it can never be claimed twice.",
  },
];

export default async function LandingPage() {
  const stats = await fetchRegistryStats();

  return (
    <div className="bg-water-950 text-foam-100">
      <SiteNav register="water" />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-water-800">
        <RootMotif
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[140%] w-full text-water-700/40 md:h-[160%]"
          animate
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 md:grid-cols-[1.15fr_0.85fr] md:items-center md:pb-28 md:pt-24">
          <div>
            <p className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">
              Blue carbon registry &amp; MRV
            </p>
            <h1 className="mt-5 font-display text-4xl leading-[1.08] font-medium text-balance sm:text-5xl md:text-6xl">
              A carbon credit is a claim.{" "}
              <span className="italic text-sand-200">Here&rsquo;s how you check it.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-foam-200">
              NeelKosh puts India&rsquo;s mangrove, seagrass and saltmarsh restoration on a public
              ledger — from the first satellite reading to the moment a credit is retired. No
              paper trail to lose. No claim you can&rsquo;t trace.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/projects"
                className="rounded-full bg-sand-500 px-6 py-3 text-sm font-semibold text-water-950 transition-colors hover:bg-sand-300"
              >
                Explore the registry
              </Link>
              <Link
                href="/verify"
                className="rounded-full border border-foam-400/40 px-6 py-3 text-sm font-semibold text-foam-100 transition-colors hover:border-sand-300 hover:text-sand-200"
              >
                Verify a credit
              </Link>
            </div>
          </div>

          <RegistryLedger stats={stats} />
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-water-800 bg-water-900">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <div className="max-w-2xl">
            <p className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">The problem</p>
            <h2 className="mt-4 font-display text-3xl font-medium sm:text-4xl">
              Blue carbon MRV runs on trust, not proof.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-foam-200">
              Most carbon registries still work like this: a project claims a number, a
              consultant signs a PDF, and buyers take it on faith. The underlying satellite
              data, the verifier&rsquo;s reasoning, the exact report a credit was minted from —
              none of it is available for anyone outside the transaction to check. When a claim
              turns out to be wrong, there&rsquo;s no record showing where it went wrong.
            </p>
          </div>
        </div>
      </section>

      {/* Solution / pipeline */}
      <section className="bg-water-950">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <p className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">How NeelKosh works</p>
          <h2 className="mt-4 max-w-xl font-display text-3xl font-medium sm:text-4xl">
            Four steps. Each one on the record.
          </h2>

          <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-water-800 bg-water-800 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((step) => (
              <li key={step.number} className="bg-water-950 p-6">
                <span className="font-data text-sm text-teal-400">{step.number}</span>
                <h3 className="mt-3 font-display text-xl font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foam-200">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-water-800 bg-water-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-16 sm:flex-row sm:items-center">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">
            See the registry, or put a project on it.
          </h2>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/projects"
              className="rounded-full bg-sand-500 px-6 py-3 text-sm font-semibold text-water-950 transition-colors hover:bg-sand-300"
            >
              Browse projects
            </Link>
            <Link
              href="/register"
              className="rounded-full border border-foam-400/40 px-6 py-3 text-sm font-semibold text-foam-100 transition-colors hover:border-sand-300 hover:text-sand-200"
            >
              Register a project
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter register="water" />
    </div>
  );
}
