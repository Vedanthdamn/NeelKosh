import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { RootMotif } from "@/components/RootMotif";
import { TokenSearchBar } from "@/components/TokenSearchBar";
import { fetchProjects, fetchProject } from "@/lib/api";

export const metadata = { title: "Verify a credit — NeelKosh" };

// A convenience link, not core functionality: if the backend is briefly unreachable, the search
// page below should still render and work — it just won't have an example to suggest.
async function findExample(): Promise<{ tokenId: string; projectName: string } | null> {
  try {
    const projects = await fetchProjects();
    for (const project of projects) {
      const detail = await fetchProject(project.projectId);
      if (detail && detail.credits.batches.length > 0) {
        return { tokenId: detail.credits.batches[0].tokenId, projectName: project.name };
      }
    }
  } catch (error) {
    console.error("Failed to find an example credit:", error);
  }
  return null;
}

export default async function VerifyLandingPage() {
  const example = await findExample();

  return (
    <div className="relative min-h-screen overflow-hidden bg-water-950 text-foam-100">
      <RootMotif className="pointer-events-none absolute inset-x-0 top-0 h-[90%] w-full text-water-800/40" />
      <SiteNav register="water" />

      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <p className="font-data text-xs uppercase tracking-[0.2em] text-sand-300">Verify a credit</p>
        <h1 className="mt-5 font-display text-4xl font-medium sm:text-5xl">
          Every credit has a <span className="italic text-sand-200">complete, checkable record.</span>
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-foam-200">
          Enter a token ID to see exactly where it came from: the MRV report it was minted
          against, who verified it, and everywhere it&rsquo;s been since.
        </p>

        <div className="mt-10 w-full">
          <TokenSearchBar />
        </div>

        {example ? (
          <p className="mt-5 text-sm text-foam-400">
            Nothing to paste yet?{" "}
            <Link href={`/verify/${example.tokenId}`} className="text-sand-300 underline underline-offset-2 hover:text-sand-200">
              Try a credit from {example.projectName}
            </Link>
          </p>
        ) : null}
      </div>

      <SiteFooter register="water" />
    </div>
  );
}
